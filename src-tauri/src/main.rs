#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
struct DesktopState {
    authorized_roots: Mutex<Vec<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct GitSummary {
    branch: Option<String>,
    remote: Option<String>,
    dirty: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    name: String,
    path: String,
    package_name: Option<String>,
    scripts: Vec<String>,
    framework_hints: Vec<String>,
    git: Option<GitSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExecResult {
    ok: bool,
    output: String,
}

fn canonical_existing(path: &str) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| format!("Unable to access project path: {error}"))
}

fn roots_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Unable to create app data directory: {error}"))?;
    Ok(dir.join("authorized-project-roots.json"))
}

fn load_roots(app: &AppHandle) -> Vec<PathBuf> {
    let Ok(file) = roots_file(app) else { return Vec::new() };
    let Ok(text) = fs::read_to_string(file) else { return Vec::new() };
    let Ok(values) = serde_json::from_str::<Vec<String>>(&text) else { return Vec::new() };
    values
        .into_iter()
        .filter_map(|value| fs::canonicalize(value).ok())
        .collect()
}

fn persist_roots(app: &AppHandle, roots: &[PathBuf]) -> Result<(), String> {
    let file = roots_file(app)?;
    let values: Vec<String> = roots.iter().map(|root| root.to_string_lossy().into_owned()).collect();
    let text = serde_json::to_string_pretty(&values).map_err(|error| error.to_string())?;
    fs::write(file, text).map_err(|error| format!("Unable to save project permissions: {error}"))
}

fn authorize_root(app: &AppHandle, state: &State<'_, DesktopState>, path: &Path) -> Result<(), String> {
    let canonical = fs::canonicalize(path).map_err(|error| format!("Unable to authorize project folder: {error}"))?;
    let mut roots = state.authorized_roots.lock().map_err(|_| "Project permission state is unavailable.".to_string())?;
    if !roots.iter().any(|root| root == &canonical) {
        roots.push(canonical);
        persist_roots(app, &roots)?;
    }
    Ok(())
}

fn ensure_authorized(state: &State<'_, DesktopState>, path: &str) -> Result<PathBuf, String> {
    let canonical = canonical_existing(path)?;
    let roots = state.authorized_roots.lock().map_err(|_| "Project permission state is unavailable.".to_string())?;
    if roots.iter().any(|root| canonical == *root || canonical.starts_with(root)) {
        Ok(canonical)
    } else {
        Err("This folder is not authorized. Choose it through project.X first.".into())
    }
}

fn command_output(command: &mut Command) -> Result<ExecResult, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().map_err(|error| format!("Unable to start command: {error}"))?;
    let mut combined = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        if !combined.is_empty() { combined.push('\n'); }
        combined.push_str(&stderr);
    }
    Ok(ExecResult { ok: output.status.success(), output: combined })
}

fn git_value(root: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new("git");
    command.current_dir(root).args(args);
    let result = command_output(&mut command).ok()?;
    if result.ok && !result.output.is_empty() { Some(result.output) } else { None }
}

fn git_summary(root: &Path) -> Option<GitSummary> {
    let inside = git_value(root, &["rev-parse", "--is-inside-work-tree"])?;
    if inside.trim() != "true" { return None; }
    let branch = git_value(root, &["branch", "--show-current"]);
    let remote = git_value(root, &["remote", "get-url", "origin"]);
    let dirty = git_value(root, &["status", "--porcelain"]).map(|value| !value.trim().is_empty()).or(Some(false));
    Some(GitSummary { branch, remote, dirty })
}

fn inspect_inner(root: &Path) -> Result<ProjectSummary, String> {
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Local project")
        .to_string();
    let mut package_name = None;
    let mut scripts = Vec::new();
    let mut framework_hints = BTreeSet::new();
    let package_path = root.join("package.json");

    if package_path.exists() {
        let text = fs::read_to_string(&package_path).map_err(|error| format!("Unable to read package.json: {error}"))?;
        if let Ok(package) = serde_json::from_str::<Value>(&text) {
            package_name = package.get("name").and_then(Value::as_str).map(ToOwned::to_owned);
            if let Some(object) = package.get("scripts").and_then(Value::as_object) {
                scripts.extend(object.keys().cloned());
                scripts.sort();
            }
            for section in ["dependencies", "devDependencies"] {
                if let Some(object) = package.get(section).and_then(Value::as_object) {
                    for key in object.keys() {
                        match key.as_str() {
                            "react" => { framework_hints.insert("React".to_string()); }
                            "vite" => { framework_hints.insert("Vite".to_string()); }
                            "next" => { framework_hints.insert("Next.js".to_string()); }
                            "vue" => { framework_hints.insert("Vue".to_string()); }
                            "svelte" | "@sveltejs/kit" => { framework_hints.insert("Svelte".to_string()); }
                            "@tauri-apps/api" => { framework_hints.insert("Tauri".to_string()); }
                            "electron" => { framework_hints.insert("Electron".to_string()); }
                            "typescript" => { framework_hints.insert("TypeScript".to_string()); }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    if root.join("Cargo.toml").exists() { framework_hints.insert("Rust".to_string()); }
    if root.join("src-tauri").exists() { framework_hints.insert("Tauri".to_string()); }

    Ok(ProjectSummary {
        name,
        path: root.to_string_lossy().into_owned(),
        package_name,
        scripts,
        framework_hints: framework_hints.into_iter().collect(),
        git: git_summary(root),
    })
}

#[tauri::command]
fn select_project_folder(app: AppHandle, state: State<'_, DesktopState>) -> Result<Option<ProjectSummary>, String> {
    let Some(folder) = rfd::FileDialog::new().set_title("Choose a project folder").pick_folder() else {
        return Ok(None);
    };
    authorize_root(&app, &state, &folder)?;
    inspect_inner(&folder).map(Some)
}

#[tauri::command]
fn inspect_project(path: String, state: State<'_, DesktopState>) -> Result<ProjectSummary, String> {
    let root = ensure_authorized(&state, &path)?;
    inspect_inner(&root)
}

#[tauri::command]
fn open_in_explorer(path: String, state: State<'_, DesktopState>) -> Result<(), String> {
    let root = ensure_authorized(&state, &path)?;
    Command::new("explorer.exe").arg(root).spawn().map_err(|error| format!("Unable to open Explorer: {error}"))?;
    Ok(())
}

#[tauri::command]
fn open_in_terminal(path: String, state: State<'_, DesktopState>) -> Result<(), String> {
    let root = ensure_authorized(&state, &path)?;
    Command::new("cmd.exe")
        .args(["/K", "cd", "/d"])
        .arg(root)
        .spawn()
        .map_err(|error| format!("Unable to open terminal: {error}"))?;
    Ok(())
}

#[tauri::command]
fn git_status(path: String, state: State<'_, DesktopState>) -> Result<Option<GitSummary>, String> {
    let root = ensure_authorized(&state, &path)?;
    Ok(git_summary(&root))
}

#[tauri::command]
fn git_commit(path: String, message: String, state: State<'_, DesktopState>) -> Result<ExecResult, String> {
    if message.trim().is_empty() { return Err("Commit message is required.".into()); }
    let root = ensure_authorized(&state, &path)?;
    if git_summary(&root).is_none() { return Err("This folder is not a Git repository.".into()); }

    let mut add = Command::new("git");
    add.current_dir(&root).args(["add", "-A"]);
    let staged = command_output(&mut add)?;
    if !staged.ok { return Ok(staged); }

    let mut commit = Command::new("git");
    commit.current_dir(&root).arg("commit").arg("-m").arg(message);
    command_output(&mut commit)
}

#[tauri::command]
fn git_push(path: String, state: State<'_, DesktopState>) -> Result<ExecResult, String> {
    let root = ensure_authorized(&state, &path)?;
    if git_summary(&root).is_none() { return Err("This folder is not a Git repository.".into()); }
    let mut command = Command::new("git");
    command.current_dir(root).arg("push");
    command_output(&mut command)
}

#[tauri::command]
fn run_script(path: String, script: String, state: State<'_, DesktopState>) -> Result<ExecResult, String> {
    let root = ensure_authorized(&state, &path)?;
    let summary = inspect_inner(&root)?;
    if !summary.scripts.iter().any(|value| value == &script) {
        return Err("That npm script is not declared by this project's package.json.".into());
    }
    let mut command = Command::new("npm.cmd");
    command.current_dir(root).args(["run", &script]);
    command_output(&mut command)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let roots = load_roots(app.handle());
            let state = DesktopState { authorized_roots: Mutex::new(roots) };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_project_folder,
            inspect_project,
            open_in_explorer,
            open_in_terminal,
            git_status,
            git_commit,
            git_push,
            run_script
        ])
        .run(tauri::generate_context!())
        .expect("error while running project.X desktop");
}

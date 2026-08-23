use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, State};

use crate::{
    authorize_root, command_output, inspect_inner, managed_workspace_dir, DesktopState, ExecResult,
    ProjectSummary,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectInitializationResult {
    pub summary: ProjectSummary,
    pub package_manager: Option<String>,
    pub install_command: Option<String>,
    pub install: Option<ExecResult>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectRunResult {
    pub ok: bool,
    pub output: String,
    pub pid: Option<u32>,
    pub script: String,
}

fn safe_folder_name(value: &str) -> String {
    let filtered: String = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' { ch } else { '-' })
        .collect();
    let trimmed = filtered.trim_matches(['-', '.']).to_string();
    if trimmed.is_empty() { "imported-project".into() } else { trimmed }
}

fn unique_destination(workspace: &Path, requested: &str) -> PathBuf {
    let base = safe_folder_name(requested);
    let first = workspace.join(&base);
    if !first.exists() { return first; }
    for index in 2..10_000 {
        let candidate = workspace.join(format!("{base}-{index}"));
        if !candidate.exists() { return candidate; }
    }
    workspace.join(format!("{base}-import"))
}

fn detect_project_root(extracted: &Path) -> PathBuf {
    let markers = ["package.json", "Cargo.toml", "pyproject.toml", "requirements.txt"];
    if markers.iter().any(|marker| extracted.join(marker).exists()) {
        return extracted.to_path_buf();
    }
    let Ok(entries) = fs::read_dir(extracted) else { return extracted.to_path_buf() };
    let entries: Vec<_> = entries.filter_map(Result::ok).collect();
    if entries.len() == 1 && entries[0].path().is_dir() {
        let only = entries[0].path();
        if markers.iter().any(|marker| only.join(marker).exists()) {
            return only;
        }
    }
    extracted.to_path_buf()
}

fn detect_package_manager(root: &Path) -> Option<(&'static str, &'static str)> {
    if root.join("pnpm-lock.yaml").exists() { return Some(("pnpm", "pnpm install")); }
    if root.join("yarn.lock").exists() { return Some(("yarn", "yarn install")); }
    if root.join("bun.lock").exists() || root.join("bun.lockb").exists() { return Some(("bun", "bun install")); }
    if root.join("package.json").exists() { return Some(("npm", "npm install")); }
    None
}

fn install_dependencies(root: &Path, manager: &str) -> Result<ExecResult, String> {
    let mut command = match manager {
        "pnpm" => Command::new("pnpm.cmd"),
        "yarn" => Command::new("yarn.cmd"),
        "bun" => Command::new("bun.exe"),
        _ => Command::new("npm.cmd"),
    };
    command.current_dir(root).arg("install");
    command_output(&mut command)
}

fn expand_zip(zip_path: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Unable to create import folder: {error}"))?;
    let escaped_zip = zip_path.to_string_lossy().replace('"', "\"");
    let escaped_destination = destination.to_string_lossy().replace('"', "\"");
    let script = format!(
        "Expand-Archive -LiteralPath \"{escaped_zip}\" -DestinationPath \"{escaped_destination}\" -Force"
    );
    let mut command = Command::new("powershell.exe");
    command.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    let result = command_output(&mut command)?;
    if result.ok { Ok(()) } else { Err(format!("Unable to unpack ZIP: {}", result.output)) }
}

#[tauri::command]
pub(crate) fn select_zip_file() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .set_title("Import a project ZIP")
        .add_filter("ZIP archive", &["zip"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub(crate) fn initialize_zip_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    zip_path: String,
    install: bool,
) -> Result<ProjectInitializationResult, String> {
    let zip = fs::canonicalize(&zip_path)
        .map_err(|error| format!("Unable to access ZIP: {error}"))?;
    if zip.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("zip")) != Some(true) {
        return Err("Only .zip project archives are supported by this importer.".into());
    }

    let workspace = managed_workspace_dir(&app)?;
    let stem = zip.file_stem().and_then(|value| value.to_str()).unwrap_or("imported-project");
    let destination = unique_destination(&workspace, stem);
    if let Err(error) = expand_zip(&zip, &destination) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }

    let detected_root = detect_project_root(&destination);
    let root = if detected_root != destination {
        // Keep the archive's folder intact. A nested single project directory is the managed root.
        detected_root
    } else {
        destination.clone()
    };
    authorize_root(&app, &state, &root)?;

    let package = detect_package_manager(&root);
    let (package_manager, install_command) = package
        .map(|(manager, command)| (Some(manager.to_string()), Some(command.to_string())))
        .unwrap_or((None, None));
    let install_result = if install {
        match package_manager.as_deref() {
            Some(manager) => Some(install_dependencies(&root, manager)?),
            None => None,
        }
    } else {
        None
    };

    Ok(ProjectInitializationResult {
        summary: inspect_inner(&root)?,
        package_manager,
        install_command,
        install: install_result,
        source: zip.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub(crate) fn create_vite_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    name: String,
    template: String,
) -> Result<ProjectInitializationResult, String> {
    let workspace = managed_workspace_dir(&app)?;
    let destination = unique_destination(&workspace, &name);
    let folder_name = destination.file_name().and_then(|value| value.to_str()).ok_or("Invalid project name.")?;
    let allowed = ["react", "react-ts", "vue", "vue-ts", "svelte", "svelte-ts", "vanilla", "vanilla-ts"];
    if !allowed.contains(&template.as_str()) {
        return Err("Unsupported starter template.".into());
    }

    let mut create = Command::new("npm.cmd");
    create.current_dir(&workspace).args(["create", "vite@latest", folder_name, "--", "--template", &template, "--yes"]);
    let created = command_output(&mut create)?;
    if !created.ok { return Err(format!("Vite project creation failed: {}", created.output)); }
    authorize_root(&app, &state, &destination)?;
    let install_result = install_dependencies(&destination, "npm")?;

    Ok(ProjectInitializationResult {
        summary: inspect_inner(&destination)?,
        package_manager: Some("npm".into()),
        install_command: Some("npm install".into()),
        install: Some(install_result),
        source: "project.X new project".into(),
    })
}

#[tauri::command]
pub(crate) fn run_dev_project(
    path: String,
    script: String,
    state: State<'_, DesktopState>,
) -> Result<ProjectRunResult, String> {
    let root = crate::ensure_authorized(&state, &path)?;
    let summary = inspect_inner(&root)?;
    if !summary.scripts.iter().any(|candidate| candidate == &script) {
        return Err(format!("Script '{script}' is not declared by this project."));
    }
    let child = Command::new("npm.cmd")
        .current_dir(&root)
        .args(["run", &script])
        .spawn()
        .map_err(|error| format!("Unable to start project: {error}"))?;
    Ok(ProjectRunResult {
        ok: true,
        output: format!("Started npm run {script} in {}", root.display()),
        pid: Some(child.id()),
        script,
    })
}

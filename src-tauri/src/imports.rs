use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, State};

use crate::{
    authorize_root, command_output, command_output_with_timeout, ensure_authorized, inspect_inner,
    managed_workspace_dir, DesktopState, ExecResult, ProjectSummary,
};

static RUNNING_PIDS: OnceLock<Mutex<BTreeSet<u32>>> = OnceLock::new();
fn running_pids() -> &'static Mutex<BTreeSet<u32>> {
    RUNNING_PIDS.get_or_init(|| Mutex::new(BTreeSet::new()))
}

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
    pub package_manager: String,
    pub url: Option<String>,
    pub log_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZipMergePreview {
    pub target_path: String,
    pub zip_path: String,
    pub added: Vec<String>,
    pub replaced: Vec<String>,
    pub added_count: usize,
    pub replaced_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZipMergeResult {
    pub summary: ProjectSummary,
    pub backup_path: String,
    pub added_count: usize,
    pub replaced_count: usize,
}

fn stamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn safe_folder_name(value: &str) -> String {
    let filtered: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = filtered.trim_matches(['-', '.']).to_string();
    if trimmed.is_empty() {
        "imported-project".into()
    } else {
        trimmed
    }
}

fn unique_destination(workspace: &Path, requested: &str) -> PathBuf {
    let base = safe_folder_name(requested);
    let first = workspace.join(&base);
    if !first.exists() {
        return first;
    }
    for index in 2..10_000 {
        let candidate = workspace.join(format!("{base}-{index}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    workspace.join(format!("{base}-import"))
}

fn detect_project_root(extracted: &Path) -> PathBuf {
    let markers = [
        "package.json",
        "Cargo.toml",
        "pyproject.toml",
        "requirements.txt",
    ];
    if markers.iter().any(|marker| extracted.join(marker).exists()) {
        return extracted.to_path_buf();
    }
    let Ok(entries) = fs::read_dir(extracted) else {
        return extracted.to_path_buf();
    };
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
    if root.join("pnpm-lock.yaml").exists() {
        return Some(("pnpm", "pnpm install"));
    }
    if root.join("yarn.lock").exists() {
        return Some(("yarn", "yarn install"));
    }
    if root.join("bun.lock").exists() || root.join("bun.lockb").exists() {
        return Some(("bun", "bun install"));
    }
    if root.join("package.json").exists() {
        return Some(("npm", "npm install"));
    }
    None
}

fn manager_command(manager: &str) -> &'static str {
    match manager {
        "pnpm" => "pnpm.cmd",
        "yarn" => "yarn.cmd",
        "bun" => "bun.exe",
        _ => "npm.cmd",
    }
}

fn ensure_manager_available(manager: &str) -> Result<(), String> {
    let mut command = Command::new(manager_command(manager));
    command.arg("--version");
    match command_output_with_timeout(&mut command, Duration::from_secs(10)) {
        Ok(output) if output.ok => Ok(()),
        _ => Err(format!("{manager} is required for this project but was not found on this PC. Open ENV / Runtimes in project.X to review the local toolchain before retrying.")),
    }
}

fn install_dependencies(root: &Path, manager: &str) -> Result<ExecResult, String> {
    ensure_manager_available(manager)?;
    let mut command = Command::new(manager_command(manager));
    command.current_dir(root).arg("install");
    let result = command_output_with_timeout(&mut command, Duration::from_secs(300))?;
    if result.ok {
        Ok(result)
    } else {
        Err(format!(
            "Dependency install failed with {manager}: {}",
            result.output
        ))
    }
}

fn run_command(root: &Path, manager: &str, script: &str) -> Result<Command, String> {
    ensure_manager_available(manager)?;
    let mut command = Command::new(manager_command(manager));
    command.current_dir(root).args(["run", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    Ok(command)
}

fn extract_local_url(text: &str) -> Option<String> {
    for needle in [
        "http://localhost:",
        "https://localhost:",
        "http://127.0.0.1:",
        "https://127.0.0.1:",
    ] {
        if let Some(start) = text.find(needle) {
            let tail = &text[start..];
            let end = tail
                .find(|ch: char| {
                    ch.is_whitespace() || matches!(ch, '\u{1b}' | '"' | '\'' | ')' | ']' | '>')
                })
                .unwrap_or(tail.len());
            let url = tail[..end]
                .trim_end_matches(|ch: char| matches!(ch, ',' | ';'))
                .to_string();
            if url.len() > needle.len() {
                return Some(url);
            }
        }
    }
    None
}

fn open_external_url(url: &str) -> Result<(), String> {
    let mut command = Command::new("explorer.exe");
    command.arg(url);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map_err(|error| format!("Project started but browser could not be opened: {error}"))?;
    Ok(())
}

fn expand_zip(zip_path: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Unable to create import folder: {error}"))?;
    let script = "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force";
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .arg(zip_path)
        .arg(destination);
    let result = command_output(&mut command)?;
    if result.ok {
        Ok(())
    } else {
        Err(format!("Unable to unpack ZIP: {}", result.output))
    }
}

fn collect_files(root: &Path, current: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(current)
        .map_err(|error| format!("Unable to inspect incoming files: {error}"))?
    {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, output)?;
        } else if path.is_file() {
            output.push(
                path.strip_prefix(root)
                    .map_err(|error| error.to_string())?
                    .to_path_buf(),
            );
        }
    }
    Ok(())
}

fn temporary_extract(zip: &Path) -> Result<PathBuf, String> {
    let temp = std::env::temp_dir().join(format!("projectx-zip-{}", stamp()));
    if temp.exists() {
        let _ = fs::remove_dir_all(&temp);
    }
    expand_zip(zip, &temp)?;
    Ok(temp)
}

fn validated_zip(path: &str) -> Result<PathBuf, String> {
    let zip = fs::canonicalize(path).map_err(|error| format!("Unable to access ZIP: {error}"))?;
    if zip
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("zip"))
        != Some(true)
    {
        return Err("Only .zip project archives are supported by this importer.".into());
    }
    Ok(zip)
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
    let zip = validated_zip(&zip_path)?;
    let workspace = managed_workspace_dir(&app)?;
    let stem = zip
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("imported-project");
    let destination = unique_destination(&workspace, stem);
    if let Err(error) = expand_zip(&zip, &destination) {
        let _ = fs::remove_dir_all(&destination);
        return Err(error);
    }
    let detected_root = detect_project_root(&destination);
    let root = if detected_root != destination {
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
pub(crate) fn clone_github_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    repo_url: String,
    name: String,
) -> Result<ProjectInitializationResult, String> {
    let parsed =
        url::Url::parse(&repo_url).map_err(|_| "A valid GitHub repository URL is required.")?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") {
        return Err("Only HTTPS github.com repository URLs can be imported.".into());
    }
    let segments: Vec<_> = parsed
        .path_segments()
        .map(|values| values.filter(|value| !value.is_empty()).collect())
        .unwrap_or_default();
    if segments.len() != 2 || segments.iter().any(|value| *value == "." || *value == "..") {
        return Err("The GitHub URL must identify one repository.".into());
    }

    let workspace = managed_workspace_dir(&app)?;
    let destination = unique_destination(
        &workspace,
        if name.trim().is_empty() {
            segments[1].trim_end_matches(".git")
        } else {
            &name
        },
    );
    let mut command = Command::new("git");
    command
        .current_dir(&workspace)
        .args(["clone", "--depth", "1"])
        .arg(parsed.as_str())
        .arg(&destination);
    let cloned = command_output_with_timeout(&mut command, Duration::from_secs(180));
    match cloned {
        Ok(result) if result.ok => {}
        Ok(result) => {
            let _ = fs::remove_dir_all(&destination);
            return Err(format!("GitHub clone failed: {}", result.output));
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&destination);
            return Err(format!("GitHub clone failed: {error}"));
        }
    }

    authorize_root(&app, &state, &destination)?;
    let package = detect_package_manager(&destination);
    let (package_manager, install_command) = package
        .map(|(manager, install)| (Some(manager.to_string()), Some(install.to_string())))
        .unwrap_or((None, None));
    Ok(ProjectInitializationResult {
        summary: inspect_inner(&destination)?,
        package_manager,
        install_command,
        install: None,
        source: parsed.to_string(),
    })
}

#[tauri::command]
pub(crate) fn preview_zip_merge(
    zip_path: String,
    target_path: String,
    state: State<'_, DesktopState>,
) -> Result<ZipMergePreview, String> {
    let target = ensure_authorized(&state, &target_path)?;
    let zip = validated_zip(&zip_path)?;
    let extracted = temporary_extract(&zip)?;
    let incoming_root = detect_project_root(&extracted);
    let mut files = Vec::new();
    let result = (|| {
        collect_files(&incoming_root, &incoming_root, &mut files)?;
        let mut added = Vec::new();
        let mut replaced = Vec::new();
        for relative in files {
            let label = relative.to_string_lossy().replace('\\', "/");
            if target.join(&relative).exists() {
                replaced.push(label);
            } else {
                added.push(label);
            }
        }
        Ok(ZipMergePreview {
            target_path: target.to_string_lossy().into_owned(),
            zip_path: zip.to_string_lossy().into_owned(),
            added_count: added.len(),
            replaced_count: replaced.len(),
            added: added.into_iter().take(120).collect(),
            replaced: replaced.into_iter().take(120).collect(),
        })
    })();
    let _ = fs::remove_dir_all(&extracted);
    result
}

#[tauri::command]
pub(crate) fn apply_zip_merge(
    app: AppHandle,
    zip_path: String,
    target_path: String,
    state: State<'_, DesktopState>,
) -> Result<ZipMergeResult, String> {
    let target = ensure_authorized(&state, &target_path)?;
    let zip = validated_zip(&zip_path)?;
    let extracted = temporary_extract(&zip)?;
    let incoming_root = detect_project_root(&extracted);
    let workspace = managed_workspace_dir(&app)?;
    let backup_root = workspace.join(".projectx-backups").join(format!(
        "merge-{}-{}",
        stamp(),
        safe_folder_name(
            target
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("project")
        )
    ));
    fs::create_dir_all(&backup_root)
        .map_err(|error| format!("Unable to create merge backup: {error}"))?;
    let mut files = Vec::new();
    collect_files(&incoming_root, &incoming_root, &mut files)?;
    let mut added_count = 0usize;
    let mut replaced_count = 0usize;
    let result = (|| {
        for relative in files {
            let incoming = incoming_root.join(&relative);
            let destination = target.join(&relative);
            if destination.exists() {
                replaced_count += 1;
                let backup = backup_root.join(&relative);
                if let Some(parent) = backup.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                fs::copy(&destination, &backup).map_err(|error| {
                    format!("Unable to back up {}: {error}", destination.display())
                })?;
            } else {
                added_count += 1;
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            fs::copy(&incoming, &destination)
                .map_err(|error| format!("Unable to merge {}: {error}", relative.display()))?;
        }
        Ok(ZipMergeResult {
            summary: inspect_inner(&target)?,
            backup_path: backup_root.to_string_lossy().into_owned(),
            added_count,
            replaced_count,
        })
    })();
    let _ = fs::remove_dir_all(&extracted);
    result
}

#[tauri::command]
pub(crate) fn create_vite_project(
    app: AppHandle,
    state: State<'_, DesktopState>,
    name: String,
    template: String,
) -> Result<ProjectInitializationResult, String> {
    ensure_manager_available("npm")?;
    let mut node = Command::new("node.exe");
    node.arg("--version");
    match command_output_with_timeout(&mut node, Duration::from_secs(10)) { Ok(output) if output.ok => {}, _ => return Err("Node.js is required to create a Vite project but was not found on this PC. Open ENV / Runtimes in project.X, install Node.js, then retry.".into()) }
    let workspace = managed_workspace_dir(&app)?;
    let destination = unique_destination(&workspace, &name);
    let folder_name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid project name.")?;
    let allowed = [
        "react",
        "react-ts",
        "vue",
        "vue-ts",
        "svelte",
        "svelte-ts",
        "vanilla",
        "vanilla-ts",
    ];
    if !allowed.contains(&template.as_str()) {
        return Err("Unsupported starter template.".into());
    }
    let mut create = Command::new("npm.cmd");
    create.current_dir(&workspace).args([
        "create",
        "vite@latest",
        folder_name,
        "--",
        "--template",
        &template,
        "--yes",
    ]);
    let created = command_output(&mut create)?;
    if !created.ok {
        return Err(format!("Vite project creation failed: {}", created.output));
    }
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
    let root = ensure_authorized(&state, &path)?;
    let summary = inspect_inner(&root)?;
    if !summary.scripts.iter().any(|candidate| candidate == &script) {
        return Err(format!(
            "Script '{script}' is not declared by this project."
        ));
    }
    let manager = detect_package_manager(&root)
        .map(|value| value.0)
        .unwrap_or("npm");
    let log_dir = std::env::temp_dir().join("projectx-runs");
    fs::create_dir_all(&log_dir)
        .map_err(|error| format!("Unable to create run log directory: {error}"))?;
    let log_path = log_dir.join(format!(
        "{}-{}-{}.log",
        safe_folder_name(&summary.name),
        script,
        stamp()
    ));
    let stdout = fs::File::create(&log_path)
        .map_err(|error| format!("Unable to create run log: {error}"))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("Unable to prepare run log: {error}"))?;
    let mut command = run_command(&root, manager, &script)?;
    command
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to start {manager} run {script}: {error}"))?;
    let pid = child.id();
    running_pids()
        .lock()
        .map_err(|_| "Run process registry is unavailable.".to_string())?
        .insert(pid);
    let mut url = None;
    let mut latest_log = String::new();
    let mut exited = false;
    for _ in 0..32 {
        thread::sleep(Duration::from_millis(250));
        latest_log = fs::read_to_string(&log_path).unwrap_or_default();
        if let Some(found) = extract_local_url(&latest_log) {
            url = Some(found);
            break;
        }
        if child
            .try_wait()
            .map_err(|error| format!("Unable to inspect running project: {error}"))?
            .is_some()
        {
            running_pids()
                .lock()
                .map_err(|_| "Run process registry is unavailable.".to_string())?
                .remove(&pid);
            exited = true;
            break;
        }
    }
    if let Some(ref local_url) = url {
        let _ = open_external_url(local_url);
    }
    let last_lines = latest_log
        .lines()
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    if exited && url.is_none() {
        return Err(format!(
            "The dev server exited before exposing a local URL.\n{}\nLog: {}",
            if last_lines.is_empty() {
                "No console output was produced."
            } else {
                &last_lines
            },
            log_path.display()
        ));
    }
    Ok(ProjectRunResult {
        ok: true,
        output: if let Some(ref local_url) = url {
            format!("Started {manager} run {script} at {local_url}")
        } else if last_lines.is_empty() {
            format!(
                "Started {manager} run {script}. Waiting for the project to expose a local URL."
            )
        } else {
            format!("Started {manager} run {script}. Latest output:\n{last_lines}")
        },
        pid: Some(pid),
        script,
        package_manager: manager.to_string(),
        url,
        log_path: log_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub(crate) fn stop_dev_project(pid: u32) -> Result<ExecResult, String> {
    let registered = running_pids()
        .lock()
        .map_err(|_| "Run process registry is unavailable.".to_string())?
        .remove(&pid);
    if !registered {
        return Err(
            "project.X can only stop development processes that it started during this session."
                .into(),
        );
    }
    let mut command = Command::new("taskkill.exe");
    command.args(["/PID", &pid.to_string(), "/T", "/F"]);
    command_output(&mut command)
}

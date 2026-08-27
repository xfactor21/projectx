use crate::{ensure_authorized, DesktopState, ExecResult};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;

static PREVIEW_PROCESSES: OnceLock<Mutex<BTreeMap<u32, PathBuf>>> = OnceLock::new();
fn processes() -> &'static Mutex<BTreeMap<u32, PathBuf>> {
    PREVIEW_PROCESSES.get_or_init(|| Mutex::new(BTreeMap::new()))
}

fn stop_pid(pid: u32) -> std::io::Result<std::process::Output> {
    Command::new("taskkill.exe")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output()
}

fn stop_existing_for_path(path: &Path) -> Result<(), String> {
    let existing = processes()
        .lock()
        .map_err(|_| "Preview process registry is unavailable.".to_string())?
        .iter()
        .find_map(|(pid, root)| (root == path).then_some(*pid));
    if let Some(pid) = existing {
        let _ = stop_pid(pid);
        processes()
            .lock()
            .map_err(|_| "Preview process registry is unavailable.".to_string())?
            .remove(&pid);
    }
    Ok(())
}

pub(crate) fn stop_all_preview_processes() {
    let ids = processes()
        .lock()
        .map(|items| items.keys().copied().collect::<Vec<_>>())
        .unwrap_or_default();
    for pid in ids {
        let _ = stop_pid(pid);
    }
    if let Ok(mut items) = processes().lock() {
        items.clear();
    }
}
fn stamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewRunResult {
    ok: bool,
    output: String,
    pid: Option<u32>,
    script: String,
    package_manager: String,
    url: Option<String>,
    log_path: String,
}

fn package_manager(root: &Path) -> &'static str {
    if root.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if root.join("yarn.lock").exists() {
        "yarn"
    } else if root.join("bun.lock").exists() || root.join("bun.lockb").exists() {
        "bun"
    } else {
        "npm"
    }
}
fn executable(manager: &str) -> &'static str {
    match manager {
        "pnpm" => "pnpm.cmd",
        "yarn" => "yarn.cmd",
        "bun" => "bun.exe",
        _ => "npm.cmd",
    }
}
fn declared(root: &Path, script: &str) -> bool {
    let Ok(text) = fs::read_to_string(root.join("package.json")) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return false;
    };
    value
        .get("scripts")
        .and_then(Value::as_object)
        .map(|scripts| scripts.contains_key(script))
        .unwrap_or(false)
}
fn tail(text: &str, count: usize) -> String {
    text.lines()
        .rev()
        .take(count)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

fn terminate_process_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill.exe")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn ensure_dependencies(root: &Path, manager: &str) -> Result<Option<String>, String> {
    if !root.join("package.json").exists() || root.join("node_modules").exists() {
        return Ok(None);
    }

    let logs = std::env::temp_dir().join("projectx-installs");
    fs::create_dir_all(&logs)
        .map_err(|error| format!("Unable to create dependency install log directory: {error}"))?;
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project")
        .replace(|ch: char| !ch.is_ascii_alphanumeric(), "-");
    let log_path = logs.join(format!("{name}-install-{}.log", stamp()));
    let stdout = fs::File::create(&log_path)
        .map_err(|error| format!("Unable to create dependency install log: {error}"))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("Unable to prepare dependency install log: {error}"))?;

    let mut command = Command::new(executable(manager));
    command.current_dir(root).arg("install");
    match manager {
        "npm" => {
            command.args(["--no-audit", "--no-fund", "--prefer-offline"]);
        }
        "pnpm" => {
            command.args(["--reporter=append-only"]);
        }
        "yarn" => {
            command.arg("--non-interactive");
        }
        _ => {}
    }
    command
        .env("CI", "true")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to start {manager} dependency install: {error}"))?;

    for _ in 0..360 {
        thread::sleep(Duration::from_millis(500));
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Unable to inspect dependency install: {error}"))?
        {
            let output = fs::read_to_string(&log_path).unwrap_or_default();
            if status.success() {
                return Ok(Some(format!("Dependencies installed with {manager}.")));
            }
            return Err(format!(
                "Dependency install failed with {manager}.\n{}\nLog: {}",
                tail(&output, 16),
                log_path.display()
            ));
        }
    }

    terminate_process_tree(&mut child);
    let output = fs::read_to_string(&log_path).unwrap_or_default();
    Err(format!("Dependency install timed out after 3 minutes and was stopped. This often means a package or Git dependency is waiting on unavailable network/authentication.\n{}\nLog: {}", tail(&output, 16), log_path.display()))
}

#[tauri::command]
pub(crate) fn run_preview_project(
    path: String,
    script: String,
    state: State<'_, DesktopState>,
) -> Result<PreviewRunResult, String> {
    let root = ensure_authorized(&state, &path)?;
    if !declared(&root, &script) {
        return Err(format!("Script '{script}' is not declared by this project. Open the project details and verify package.json scripts."));
    }
    let manager = package_manager(&root);
    let check = Command::new(executable(manager)).arg("--version").output();
    if !matches!(check, Ok(ref output) if output.status.success()) {
        return Err(format!("{manager} is required but is not available on this PC. Open ENV / Runtimes to review the toolchain."));
    }
    let install_note = ensure_dependencies(&root, manager)?;
    stop_existing_for_path(&root)?;

    let logs = std::env::temp_dir().join("projectx-runs");
    fs::create_dir_all(&logs)
        .map_err(|error| format!("Unable to create run log directory: {error}"))?;
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project")
        .replace(|ch: char| !ch.is_ascii_alphanumeric(), "-");
    let log_path = logs.join(format!("{name}-{script}-{}.log", stamp()));
    let stdout = fs::File::create(&log_path)
        .map_err(|error| format!("Unable to create run log: {error}"))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("Unable to prepare run log: {error}"))?;
    let mut command = Command::new(executable(manager));
    command
        .current_dir(&root)
        .args(["run", &script])
        .env("CI", "false")
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to start {manager} run {script}: {error}"))?;
    let pid = child.id();
    processes()
        .lock()
        .map_err(|_| "Preview process registry is unavailable.".to_string())?
        .insert(pid, root.clone());
    let mut url = None;
    let mut latest = String::new();
    let mut exited = false;

    for _ in 0..240 {
        thread::sleep(Duration::from_millis(250));
        latest = fs::read_to_string(&log_path).unwrap_or_default();
        if let Some(found) = crate::local_dev_url::extract(&latest) {
            if crate::local_dev_url::is_listening(&found) {
                url = Some(found);
                break;
            }
        }
        if child
            .try_wait()
            .map_err(|error| format!("Unable to inspect project process: {error}"))?
            .is_some()
        {
            processes()
                .lock()
                .map_err(|_| "Preview process registry is unavailable.".to_string())?
                .remove(&pid);
            exited = true;
            break;
        }
    }

    let latest_tail = tail(&latest, 16);
    if exited && url.is_none() {
        return Err(format!(
            "The dev server exited before exposing a local URL.\n{}\nLog: {}",
            if latest_tail.is_empty() {
                "No console output was produced."
            } else {
                &latest_tail
            },
            log_path.display()
        ));
    }

    if url.is_none() {
        terminate_process_tree(&mut child);
        processes()
            .lock()
            .map_err(|_| "Preview process registry is unavailable.".to_string())?
            .remove(&pid);
        return Err(format!(
            "The dev server did not expose a local URL within 60 seconds and was stopped.\n{}\nLog: {}",
            if latest_tail.is_empty() {
                "No console output was produced."
            } else {
                &latest_tail
            },
            log_path.display()
        ));
    }

    let mut output = format!(
        "Started {manager} run {script} at {}.",
        url.as_deref().unwrap_or_default()
    );
    if let Some(note) = install_note {
        output = format!("{note}\n{output}");
    }

    Ok(PreviewRunResult {
        ok: true,
        output,
        pid: Some(pid),
        script,
        package_manager: manager.into(),
        url,
        log_path: log_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub(crate) fn stop_preview_project(pid: u32) -> Result<ExecResult, String> {
    if processes()
        .lock()
        .map_err(|_| "Preview process registry is unavailable.".to_string())?
        .remove(&pid)
        .is_none()
    {
        return Err(
            "project.X can only stop Preview processes it started during this session.".into(),
        );
    }
    let output = stop_pid(pid).map_err(|error| format!("Unable to stop project: {error}"))?;
    let mut text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !err.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&err);
    }
    Ok(ExecResult {
        ok: output.status.success(),
        output: text,
    })
}

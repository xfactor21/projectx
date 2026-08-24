use serde_json::Value;
use serde::Serialize;
use std::{collections::BTreeSet, fs, path::Path, process::{Command, Stdio}, sync::{Mutex, OnceLock}, thread, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::State;
use crate::{ensure_authorized, DesktopState, ExecResult};

static PREVIEW_PIDS: OnceLock<Mutex<BTreeSet<u32>>> = OnceLock::new();
fn pids() -> &'static Mutex<BTreeSet<u32>> { PREVIEW_PIDS.get_or_init(|| Mutex::new(BTreeSet::new())) }
fn stamp() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_secs()).unwrap_or(0) }

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
    if root.join("pnpm-lock.yaml").exists() { "pnpm" }
    else if root.join("yarn.lock").exists() { "yarn" }
    else if root.join("bun.lock").exists() || root.join("bun.lockb").exists() { "bun" }
    else { "npm" }
}
fn executable(manager: &str) -> &'static str { match manager { "pnpm" => "pnpm.cmd", "yarn" => "yarn.cmd", "bun" => "bun.exe", _ => "npm.cmd" } }
fn declared(root: &Path, script: &str) -> bool {
    let Ok(text) = fs::read_to_string(root.join("package.json")) else { return false };
    let Ok(value) = serde_json::from_str::<Value>(&text) else { return false };
    value.get("scripts").and_then(Value::as_object).map(|scripts| scripts.contains_key(script)).unwrap_or(false)
}
fn local_url(text: &str) -> Option<String> {
    for needle in ["http://localhost:", "https://localhost:", "http://127.0.0.1:", "https://127.0.0.1:"] {
        if let Some(start) = text.find(needle) {
            let tail = &text[start..];
            let end = tail.find(|ch: char| ch.is_whitespace() || matches!(ch, '\u{1b}' | '"' | '\'' | ')' | ']' | '>')).unwrap_or(tail.len());
            return Some(tail[..end].trim_end_matches(|ch: char| matches!(ch, ',' | ';')).to_string());
        }
    }
    None
}

#[tauri::command]
pub(crate) fn run_preview_project(path: String, script: String, state: State<'_, DesktopState>) -> Result<PreviewRunResult, String> {
    let root = ensure_authorized(&state, &path)?;
    if !declared(&root, &script) { return Err(format!("Script '{script}' is not declared by this project.")); }
    let manager = package_manager(&root);
    let check = Command::new(executable(manager)).arg("--version").output();
    if !matches!(check, Ok(ref output) if output.status.success()) { return Err(format!("{manager} is required but is not available on this PC.")); }
    let logs = std::env::temp_dir().join("projectx-runs");
    fs::create_dir_all(&logs).map_err(|error| format!("Unable to create run log directory: {error}"))?;
    let name = root.file_name().and_then(|value| value.to_str()).unwrap_or("project").replace(|ch: char| !ch.is_ascii_alphanumeric(), "-");
    let log_path = logs.join(format!("{name}-{script}-{}.log", stamp()));
    let stdout = fs::File::create(&log_path).map_err(|error| format!("Unable to create run log: {error}"))?;
    let stderr = stdout.try_clone().map_err(|error| format!("Unable to prepare run log: {error}"))?;
    let mut command = Command::new(executable(manager));
    command.current_dir(&root).args(["run", &script]).stdout(Stdio::from(stdout)).stderr(Stdio::from(stderr));
    #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    let mut child = command.spawn().map_err(|error| format!("Unable to start {manager} run {script}: {error}"))?;
    let pid = child.id();
    pids().lock().map_err(|_| "Preview process registry is unavailable.".to_string())?.insert(pid);
    let mut url = None;
    let mut latest = String::new();
    for _ in 0..40 {
        thread::sleep(Duration::from_millis(250));
        latest = fs::read_to_string(&log_path).unwrap_or_default();
        if let Some(found) = local_url(&latest) { url = Some(found); break; }
        if child.try_wait().map_err(|error| format!("Unable to inspect project process: {error}"))?.is_some() {
            pids().lock().map_err(|_| "Preview process registry is unavailable.".to_string())?.remove(&pid);
            break;
        }
    }
    let tail = latest.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
    Ok(PreviewRunResult {
        ok: true,
        output: match &url { Some(value) => format!("Started {manager} run {script} at {value}. Opened with project.X Preview control."), None if !tail.is_empty() => format!("Started {manager} run {script}. Latest output:\n{tail}"), None => format!("Started {manager} run {script}.") },
        pid: Some(pid), script, package_manager: manager.into(), url, log_path: log_path.to_string_lossy().into_owned()
    })
}

#[tauri::command]
pub(crate) fn stop_preview_project(pid: u32) -> Result<ExecResult, String> {
    if !pids().lock().map_err(|_| "Preview process registry is unavailable.".to_string())?.remove(&pid) {
        return Err("project.X can only stop Preview processes it started during this session.".into());
    }
    let output = Command::new("taskkill.exe").args(["/PID", &pid.to_string(), "/T", "/F"]).output().map_err(|error| format!("Unable to stop project: {error}"))?;
    let mut text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !err.is_empty() { if !text.is_empty() { text.push('\n'); } text.push_str(&err); }
    Ok(ExecResult { ok: output.status.success(), output: text })
}

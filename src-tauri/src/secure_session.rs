use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{fs, process::Command, time::Duration};
use tauri::{AppHandle, Manager};

use crate::command_output_with_timeout;

fn session_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;
    Ok(dir.join("secure-session.bin"))
}

#[tauri::command]
pub(crate) fn save_secure_session(app: AppHandle, content: String) -> Result<(), String> {
    if content.len() > 512 * 1024 {
        return Err("Cloud session payload is unexpectedly large.".into());
    }
    let path = session_file(&app)?;
    let encoded = STANDARD.encode(content.as_bytes());
    let script = r#"
$bytes = [Convert]::FromBase64String($env:PROJECTX_SESSION_B64)
$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($args[0], $protected)
"#;
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .arg(&path)
        .env("PROJECTX_SESSION_B64", encoded);
    let result = command_output_with_timeout(&mut command, Duration::from_secs(15))?;
    if result.ok { Ok(()) } else { Err(format!("Unable to protect cloud session: {}", result.output)) }
}

#[tauri::command]
pub(crate) fn load_secure_session(app: AppHandle) -> Result<Option<String>, String> {
    let path = session_file(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let script = r#"
$protected = [IO.File]::ReadAllBytes($args[0])
$bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($bytes))
"#;
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .arg(&path);
    let result = command_output_with_timeout(&mut command, Duration::from_secs(15))?;
    if !result.ok {
        return Err(format!("Unable to unlock cloud session: {}", result.output));
    }
    let decoded = STANDARD
        .decode(result.output.trim())
        .map_err(|_| "Protected cloud session is corrupted.".to_string())?;
    String::from_utf8(decoded)
        .map(Some)
        .map_err(|_| "Protected cloud session is not valid UTF-8.".to_string())
}

#[tauri::command]
pub(crate) fn clear_secure_session(app: AppHandle) -> Result<(), String> {
    let path = session_file(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Unable to clear protected cloud session: {error}"))?;
    }
    Ok(())
}

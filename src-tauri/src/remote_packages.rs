use std::{fs, path::PathBuf, process::Command, time::{SystemTime, UNIX_EPOCH}};

fn stamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_secs()).unwrap_or(0)
}

fn safe_name(value: &str) -> String {
    let name: String = value.chars().map(|ch| if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') { ch } else { '-' }).collect();
    let trimmed = name.trim_matches(['-', '.']);
    if trimmed.is_empty() { "companion-project.zip".into() } else if trimmed.to_ascii_lowercase().ends_with(".zip") { trimmed.into() } else { format!("{trimmed}.zip") }
}

#[tauri::command]
pub(crate) fn download_remote_package(url: String, file_name: String) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost")) {
        return Err("Remote package URL was rejected.".into());
    }
    let folder = std::env::temp_dir().join("projectx-companion-packages");
    fs::create_dir_all(&folder).map_err(|error| format!("Unable to prepare package cache: {error}"))?;
    let destination: PathBuf = folder.join(format!("{}-{}", stamp(), safe_name(&file_name)));
    let escaped_url = url.replace('"', "\"");
    let escaped_dest = destination.to_string_lossy().replace('"', "\"");
    let script = format!("Invoke-WebRequest -UseBasicParsing -Uri \"{escaped_url}\" -OutFile \"{escaped_dest}\"");
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|error| format!("Unable to download companion package: {error}"))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() { "Companion package download failed.".into() } else { message });
    }
    if !destination.exists() || destination.metadata().map(|meta| meta.len()).unwrap_or(0) == 0 {
        return Err("Companion package download produced an empty file.".into());
    }
    Ok(destination.to_string_lossy().into_owned())
}

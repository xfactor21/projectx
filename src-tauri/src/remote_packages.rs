use crate::command_output_with_timeout;
use std::{
    fs,
    path::PathBuf,
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn stamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn safe_name(value: &str) -> String {
    let name: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = name.trim_matches(['-', '.']);
    if trimmed.is_empty() {
        "companion-project.zip".into()
    } else if trimmed.to_ascii_lowercase().ends_with(".zip") {
        trimmed.into()
    } else {
        format!("{trimmed}.zip")
    }
}

#[tauri::command]
pub(crate) fn download_remote_package(url: String, file_name: String) -> Result<String, String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Remote package URL was rejected.")?;
    let local_http =
        parsed.scheme() == "http" && matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"));
    if parsed.scheme() != "https" && !local_http {
        return Err("Remote package URL was rejected.".into());
    }
    let folder = std::env::temp_dir().join("projectx-companion-packages");
    fs::create_dir_all(&folder)
        .map_err(|error| format!("Unable to prepare package cache: {error}"))?;
    let destination: PathBuf = folder.join(format!("{}-{}", stamp(), safe_name(&file_name)));
    let mut command = Command::new("curl.exe");
    command
        .args([
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--connect-timeout",
            "15",
            "--max-time",
            "120",
            "--output",
        ])
        .arg(&destination)
        .arg(&url);
    let output = command_output_with_timeout(&mut command, Duration::from_secs(130))?;
    if !output.ok {
        let _ = fs::remove_file(&destination);
        return Err(if output.output.is_empty() {
            "Companion package download failed.".into()
        } else {
            output.output
        });
    }
    if !destination.exists() || destination.metadata().map(|meta| meta.len()).unwrap_or(0) == 0 {
        return Err("Companion package download produced an empty file.".into());
    }
    Ok(destination.to_string_lossy().into_owned())
}

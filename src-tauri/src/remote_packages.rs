use crate::command_output_with_timeout;
use std::{
    fs,
    io::Read,
    path::PathBuf,
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX_PACKAGE_BYTES: u64 = 100 * 1024 * 1024;

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

fn valid_zip_signature(signature: [u8; 4]) -> bool {
    signature == *b"PK\x03\x04" || signature == *b"PK\x05\x06" || signature == *b"PK\x07\x08"
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
    let bytes = destination.metadata().map(|meta| meta.len()).unwrap_or(0);
    if !destination.exists() || bytes == 0 {
        return Err("Companion package download produced an empty file.".into());
    }
    if bytes > MAX_PACKAGE_BYTES {
        let _ = fs::remove_file(&destination);
        return Err("Companion package exceeded the 100 MB download limit.".into());
    }
    let mut signature = [0_u8; 4];
    fs::File::open(&destination)
        .and_then(|mut file| file.read_exact(&mut signature))
        .map_err(|error| format!("Unable to validate downloaded ZIP: {error}"))?;
    if !valid_zip_signature(signature) {
        let _ = fs::remove_file(&destination);
        return Err("The downloaded companion package is not a valid ZIP archive. Recreate the ZIP and send it again.".into());
    }
    Ok(destination.to_string_lossy().into_owned())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_names_and_zip_signatures_are_validated() {
        assert_eq!(safe_name("my project.zip"), "my-project.zip");
        assert_eq!(safe_name(".."), "companion-project.zip");
        assert!(valid_zip_signature(*b"PK\x03\x04"));
        assert!(valid_zip_signature(*b"PK\x05\x06"));
        assert!(!valid_zip_signature(*b"<htm"));
    }
}

#[tauri::command]
pub(crate) fn remove_remote_package(path: String) -> Result<(), String> {
    let cache = fs::canonicalize(std::env::temp_dir().join("projectx-companion-packages"))
        .map_err(|error| format!("Unable to access package cache: {error}"))?;
    let file = fs::canonicalize(&path).map_err(|error| format!("Unable to access cached package: {error}"))?;
    if !file.starts_with(cache) || !file.is_file() {
        return Err("Only downloaded companion packages can be removed.".into());
    }
    fs::remove_file(file).map_err(|error| format!("Unable to remove cached package: {error}"))
}

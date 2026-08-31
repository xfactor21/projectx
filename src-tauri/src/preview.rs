use std::process::Command;

use tauri::AppHandle;

fn validate_local_url(value: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(value).map_err(|error| format!("Invalid preview URL: {error}"))?;
    let host = parsed.host_str().unwrap_or_default();
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Preview URL must use http or https.".into());
    }
    if !matches!(host, "localhost" | "127.0.0.1" | "::1") {
        return Err("project.X Preview only opens local development URLs.".into());
    }
    if parsed.port().is_none() {
        return Err("Preview URL must include a local development port.".into());
    }
    Ok(parsed)
}

fn validate_external_url(value: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(value).map_err(|error| format!("Invalid external URL: {error}"))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("External URLs must use http or https.".into());
    }
    if parsed.host_str().unwrap_or_default().is_empty() {
        return Err("External URL must include a host.".into());
    }
    Ok(parsed)
}

fn open_in_default_browser(parsed: &url::Url) -> Result<(), String> {
    let mut command = Command::new("explorer.exe");
    command.arg(parsed.as_str());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map_err(|error| format!("Unable to open the URL in your browser: {error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn open_preview_window(
    _app: AppHandle,
    _project_id: String,
    _project_name: String,
    url: String,
) -> Result<(), String> {
    let parsed = validate_local_url(&url)?;
    open_in_default_browser(&parsed)
}

#[tauri::command]
pub(crate) fn open_external_url(url: String) -> Result<(), String> {
    let parsed = validate_external_url(&url)?;
    open_in_default_browser(&parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_accepts_only_loopback_http_urls() {
        assert!(validate_local_url("http://localhost:5173/").is_ok());
        assert!(validate_local_url("http://127.0.0.1:8081/path").is_ok());
        assert!(validate_local_url("http://localhost:").is_err());
        assert!(validate_local_url("http://localhost/").is_err());
        assert!(validate_local_url("https://example.com").is_err());
        assert!(validate_local_url("file:///C:/project/index.html").is_err());
    }

    #[test]
    fn external_urls_accept_only_hosted_http() {
        assert!(validate_external_url("https://www.planet-x.co/music").is_ok());
        assert!(validate_external_url("http://example.com/path").is_ok());
        assert!(validate_external_url("file:///C:/project/index.html").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
    }
}

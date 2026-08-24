use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

fn label_for(project_id: &str) -> String {
    let safe: String = project_id.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' }).collect();
    format!("preview-{}", safe.trim_matches('-'))
}

fn validate_local_url(value: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(value).map_err(|error| format!("Invalid preview URL: {error}"))?;
    let host = parsed.host_str().unwrap_or_default();
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Preview URL must use http or https.".into());
    }
    if !matches!(host, "localhost" | "127.0.0.1" | "::1") {
        return Err("project.X Preview only opens local development URLs.".into());
    }
    Ok(parsed)
}

#[tauri::command]
pub(crate) fn open_preview_window(app: AppHandle, project_id: String, project_name: String, url: String) -> Result<(), String> {
    let label = label_for(&project_id);
    let parsed = validate_local_url(&url)?;
    if let Some(existing) = app.get_webview_window(&label) {
        existing.navigate(parsed).map_err(|error| format!("Unable to navigate Preview: {error}"))?;
        existing.show().map_err(|error| format!("Unable to show Preview: {error}"))?;
        existing.set_focus().map_err(|error| format!("Unable to focus Preview: {error}"))?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title(format!("{} — project.X Preview", project_name))
        .inner_size(1180.0, 780.0)
        .min_inner_size(420.0, 320.0)
        .resizable(true)
        .build()
        .map_err(|error| format!("Unable to open project.X Preview: {error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn reload_preview_window(app: AppHandle, project_id: String) -> Result<(), String> {
    let label = label_for(&project_id);
    let window = app.get_webview_window(&label).ok_or("Preview window is not open.")?;
    window.eval("location.reload()").map_err(|error| format!("Unable to reload Preview: {error}"))
}

#[tauri::command]
pub(crate) fn close_preview_window(app: AppHandle, project_id: String) -> Result<(), String> {
    let label = label_for(&project_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|error| format!("Unable to close Preview: {error}"))?;
    }
    Ok(())
}

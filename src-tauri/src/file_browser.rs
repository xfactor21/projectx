use serde::Serialize;
use std::{fs, path::{Component, Path, PathBuf}, process::Command, time::UNIX_EPOCH};
use tauri::State;
use crate::{ensure_authorized, DesktopState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectFileEntry {
    name: String,
    relative_path: String,
    is_directory: bool,
    bytes: Option<u64>,
    modified_at: Option<u64>,
}

fn inside_root(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut candidate = root.to_path_buf();
    for part in Path::new(relative).components() {
        match part {
            Component::Normal(name) => candidate.push(name),
            Component::CurDir => {},
            _ => return Err("Only paths inside this project are allowed.".into()),
        }
    }
    let canonical = fs::canonicalize(candidate).map_err(|_| "That project item is unavailable.".to_string())?;
    if !canonical.starts_with(root) {
        return Err("This file resolves outside the authorized project root.".into());
    }
    Ok(canonical)
}

#[tauri::command]
pub(crate) fn list_project_files(root: String, relative_path: String, state: State<'_, DesktopState>) -> Result<Vec<ProjectFileEntry>, String> {
    let project = ensure_authorized(&state, &root)?;
    let folder = inside_root(&project, &relative_path)?;
    if !folder.is_dir() { return Err("Select a folder to browse.".into()); }
    let mut entries = Vec::new();
    for item in fs::read_dir(&folder).map_err(|error| format!("Unable to list directory: {error}"))?.flatten() {
        if entries.len() >= 250 { break; }
        let name = item.file_name().to_string_lossy().into_owned();
        if name == ".git" || name == "node_modules" || name == ".env" || name.ends_with(".pem") || name.ends_with(".key") { continue; }
        let Ok(resolved) = fs::canonicalize(item.path()) else { continue; };
        if !resolved.starts_with(&project) { continue; }
        let Ok(metadata) = fs::metadata(&resolved) else { continue; };
        let Some(relative) = resolved.strip_prefix(&project).ok() else { continue; };
        entries.push(ProjectFileEntry {
            name,
            relative_path: relative.to_string_lossy().replace('\\', "/"),
            is_directory: metadata.is_dir(),
            bytes: if metadata.is_file() { Some(metadata.len()) } else { None },
            modified_at: metadata.modified().ok().and_then(|value| value.duration_since(UNIX_EPOCH).ok()).map(|value| value.as_millis() as u64),
        });
    }
    entries.sort_by(|a,b| b.is_directory.cmp(&a.is_directory).then_with(|| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase())));
    Ok(entries)
}

#[tauri::command]
pub(crate) fn open_project_file(root: String, relative_path: String, state: State<'_, DesktopState>) -> Result<(), String> {
    let project = ensure_authorized(&state, &root)?;
    let file = inside_root(&project, &relative_path)?;
    if !file.is_file() { return Err("Choose a file to open.".into()); }
    let name = file.file_name().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if name == ".env" || name.starts_with(".env.") || name.contains("secret") || name.contains("credential") || name.ends_with(".key") || name.ends_with(".pem") {
        return Err("Sensitive configuration files cannot be opened from project.X.".into());
    }
    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", ""]).arg(&file).status();
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(&file).status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(&file).status();
    status.map_err(|error| format!("Unable to open file: {error}"))?.success().then_some(()).ok_or_else(|| "The system application could not open this file.".into())
}

#[tauri::command]
pub(crate) fn read_project_text(root: String, relative_path: String, state: State<'_, DesktopState>) -> Result<String, String> {
    let project = ensure_authorized(&state, &root)?;
    let file = inside_root(&project, &relative_path)?;
    if !file.is_file() { return Err("Choose a text file.".into()); }
    let name = file.file_name().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if name == ".env" || name.starts_with(".env.") || name.contains("secret") || name.contains("credential") || name.ends_with(".key") || name.ends_with(".pem") {
        return Err("Sensitive configuration files are not previewed.".into());
    }
    let ext = file.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["md","txt","json","ts","tsx","js","jsx","css","html","yml","yaml","toml","py","rs","xml","svg"].contains(&ext.as_str()) {
        return Err("Preview is limited to common source and documentation files.".into());
    }
    let metadata = fs::metadata(&file).map_err(|error| error.to_string())?;
    if metadata.len() > 256_000 { return Err("This file exceeds the 256 KB preview limit.".into()); }
    fs::read_to_string(&file).map_err(|_| "This file cannot be previewed as UTF-8 text.".into())
}

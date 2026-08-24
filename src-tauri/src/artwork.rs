use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{fs, path::{Path, PathBuf}};
use tauri::State;

use crate::{ensure_authorized, DesktopState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArtworkCandidate {
    pub path: String,
    pub relative_path: String,
    pub file_name: String,
    pub kind: String,
    pub score: i32,
    pub bytes: u64,
    pub data_url: Option<String>,
}

fn image_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_string_lossy().to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

fn ignored_dir(name: &str) -> bool {
    matches!(name.to_ascii_lowercase().as_str(),
        "node_modules" | ".git" | "dist" | "build" | "target" | ".next" | ".cache" |
        "coverage" | ".turbo" | ".vercel" | ".vite" | "vendor")
}

fn classify(name: &str, relative: &str) -> (String, i32) {
    let lower = name.to_ascii_lowercase();
    let rel = relative.to_ascii_lowercase();
    let mut score = 0;
    let kind = if lower.contains("app-icon") || lower == "icon.png" || lower == "icon.ico" || lower.starts_with("icon-") {
        score += 100; "icon"
    } else if lower.contains("logo") || lower.contains("brand") {
        score += 90; "logo"
    } else if lower.contains("banner") || lower.contains("hero") {
        score += 72; "banner"
    } else if lower.contains("cover") || lower.contains("poster") {
        score += 68; "cover"
    } else if lower.contains("favicon") {
        score += 55; "icon"
    } else if lower.contains("screenshot") || lower.contains("screen-shot") || lower.contains("preview") {
        score += 35; "screenshot"
    } else {
        score += 12; "image"
    };

    if rel.starts_with("public/") || rel.contains("/public/") { score += 12; }
    if rel.starts_with("assets/") || rel.contains("/assets/") { score += 10; }
    if rel.contains("src/assets") || rel.contains("src\\assets") { score += 8; }
    if rel.contains("icons/") || rel.contains("icons\\") { score += 8; }
    if lower.contains("512") || lower.contains("256") { score += 4; }
    if lower.contains("16") || lower.contains("32") { score -= 3; }
    (kind.to_string(), score)
}

fn walk(root: &Path, current: &Path, depth: usize, output: &mut Vec<PathBuf>) -> Result<(), String> {
    if depth > 7 || output.len() >= 300 { return Ok(()); }
    let entries = match fs::read_dir(current) { Ok(value) => value, Err(_) => return Ok(()) };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !ignored_dir(&name) { walk(root, &path, depth + 1, output)?; }
        } else if path.is_file() && image_mime(&path).is_some() {
            if path.strip_prefix(root).is_ok() { output.push(path); }
        }
        if output.len() >= 300 { break; }
    }
    Ok(())
}

fn preview(path: &Path, mime: &str, bytes: u64) -> Option<String> {
    // Keep localStorage/UI pressure bounded. Very large artwork can still be manually selected.
    if bytes > 2_500_000 { return None; }
    let data = fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(data)))
}

#[tauri::command]
pub(crate) fn discover_project_artwork(
    path: String,
    state: State<'_, DesktopState>,
) -> Result<Vec<ArtworkCandidate>, String> {
    let root = ensure_authorized(&state, &path)?;
    let mut files = Vec::new();
    walk(&root, &root, 0, &mut files)?;
    let mut candidates = Vec::new();

    for file in files {
        let Some(mime) = image_mime(&file) else { continue };
        let relative = file.strip_prefix(&root).unwrap_or(&file).to_string_lossy().replace('\\', "/");
        let file_name = file.file_name().and_then(|value| value.to_str()).unwrap_or("image").to_string();
        let metadata = match fs::metadata(&file) { Ok(value) => value, Err(_) => continue };
        let bytes = metadata.len();
        let (kind, mut score) = classify(&file_name, &relative);
        if bytes < 2_000 { score -= 12; }
        if bytes > 8_000_000 { score -= 8; }
        candidates.push(ArtworkCandidate {
            path: file.to_string_lossy().into_owned(),
            relative_path: relative,
            file_name,
            kind,
            score,
            bytes,
            data_url: preview(&file, mime, bytes),
        });
    }

    candidates.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.relative_path.cmp(&b.relative_path)));
    candidates.truncate(40);
    Ok(candidates)
}

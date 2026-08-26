use serde::Serialize;
use std::{fs, path::PathBuf};

const MAX_BACKUP_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceBackupFile {
    path: String,
    content: String,
}

fn json_path(path: PathBuf) -> Result<PathBuf, String> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("json"))
        != Some(true)
    {
        return Err("Workspace backups must use the .json extension.".into());
    }
    Ok(path)
}

#[tauri::command]
pub(crate) fn save_workspace_backup(
    content: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    if content.len() as u64 > MAX_BACKUP_BYTES {
        return Err("Workspace backup exceeds the 32 MB safety limit.".into());
    }
    let safe_name = if suggested_name.ends_with(".json") {
        suggested_name
    } else {
        format!("{suggested_name}.json")
    };
    let Some(path) = rfd::FileDialog::new()
        .set_title("Save project.X workspace backup")
        .set_file_name(&safe_name)
        .add_filter("project.X backup", &["json"])
        .save_file()
    else {
        return Ok(None);
    };
    let path = json_path(path)?;
    fs::write(&path, content)
        .map_err(|error| format!("Unable to save workspace backup: {error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub(crate) fn select_workspace_backup() -> Result<Option<WorkspaceBackupFile>, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Restore project.X workspace backup")
        .add_filter("project.X backup", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    let path = json_path(path)?;
    let bytes = fs::metadata(&path)
        .map_err(|error| format!("Unable to inspect workspace backup: {error}"))?
        .len();
    if bytes > MAX_BACKUP_BYTES {
        return Err("Workspace backup exceeds the 32 MB safety limit.".into());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read workspace backup: {error}"))?;
    Ok(Some(WorkspaceBackupFile {
        path: path.to_string_lossy().into_owned(),
        content,
    }))
}

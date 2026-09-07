use std::fs;
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::{ptr, slice};
#[cfg(windows)]
use winapi::shared::minwindef::LPVOID;
#[cfg(windows)]
use winapi::um::dpapi::{CryptProtectData, CryptUnprotectData};
#[cfg(windows)]
use winapi::um::winbase::LocalFree;
#[cfg(windows)]
use winapi::um::wincrypt::DATA_BLOB;

fn session_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;
    Ok(dir.join("secure-session.bin"))
}

#[cfg(windows)]
fn protect_bytes(content: &[u8]) -> Result<Vec<u8>, String> {
    if content.is_empty() {
        return Err("Cloud session payload is empty.".into());
    }
    let mut input = DATA_BLOB {
        cbData: content.len() as u32,
        pbData: content.as_ptr() as *mut u8,
    };
    let mut output = DATA_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptProtectData(
            &mut input,
            ptr::null(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            0,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(format!(
            "Unable to protect cloud session with Windows DPAPI: {}",
            std::io::Error::last_os_error()
        ));
    }
    let protected = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData as LPVOID) };
    Ok(protected)
}

#[cfg(windows)]
fn unprotect_bytes(content: &[u8]) -> Result<Vec<u8>, String> {
    if content.is_empty() {
        return Err("Protected cloud session is empty.".into());
    }
    let mut input = DATA_BLOB {
        cbData: content.len() as u32,
        pbData: content.as_ptr() as *mut u8,
    };
    let mut output = DATA_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &mut input,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            0,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(format!(
            "Unable to unlock cloud session with Windows DPAPI: {}",
            std::io::Error::last_os_error()
        ));
    }
    let decoded = unsafe { slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData as LPVOID) };
    Ok(decoded)
}

#[tauri::command]
pub(crate) fn save_secure_session(app: AppHandle, content: String) -> Result<(), String> {
    if content.len() > 512 * 1024 {
        return Err("Cloud session payload is unexpectedly large.".into());
    }
    #[cfg(windows)]
    {
        let path = session_file(&app)?;
        let protected = protect_bytes(content.as_bytes())?;
        fs::write(&path, protected)
            .map_err(|error| format!("Unable to write protected cloud session: {error}"))?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        let _ = content;
        Err("Protected desktop cloud sessions are currently supported on Windows only.".into())
    }
}

#[tauri::command]
pub(crate) fn load_secure_session(app: AppHandle) -> Result<Option<String>, String> {
    let path = session_file(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    #[cfg(windows)]
    {
        let protected = fs::read(&path)
            .map_err(|error| format!("Unable to read protected cloud session: {error}"))?;
        let decoded = unprotect_bytes(&protected)?;
        return String::from_utf8(decoded)
            .map(Some)
            .map_err(|_| "Protected cloud session is not valid UTF-8.".to_string());
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Protected desktop cloud sessions are currently supported on Windows only.".into())
    }
}

#[tauri::command]
pub(crate) fn clear_secure_session(app: AppHandle) -> Result<(), String> {
    let path = session_file(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("Unable to clear protected cloud session: {error}"))?;
    }
    Ok(())
}

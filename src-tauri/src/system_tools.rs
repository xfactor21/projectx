use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolStatus {
    pub name: String,
    pub command: String,
    pub installed: bool,
    pub version: Option<String>,
}

fn tool(name: &str, command: &str, args: &[&str]) -> ToolStatus {
    let result = Command::new(command).args(args).output();
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let version = if !stdout.is_empty() { Some(stdout.lines().next().unwrap_or("").to_string()) }
                else if !stderr.is_empty() { Some(stderr.lines().next().unwrap_or("").to_string()) }
                else { None };
            ToolStatus { name: name.into(), command: command.into(), installed: output.status.success(), version }
        }
        Err(_) => ToolStatus { name: name.into(), command: command.into(), installed: false, version: None },
    }
}

#[tauri::command]
pub(crate) fn toolchain_preflight() -> Vec<ToolStatus> {
    vec![
        tool("Node.js", "node.exe", &["--version"]),
        tool("npm", "npm.cmd", &["--version"]),
        tool("pnpm", "pnpm.cmd", &["--version"]),
        tool("Yarn", "yarn.cmd", &["--version"]),
        tool("Bun", "bun.exe", &["--version"]),
        tool("Git", "git.exe", &["--version"]),
        tool("Rust", "rustc.exe", &["--version"]),
        tool("Cargo", "cargo.exe", &["--version"]),
        tool("Python", "python.exe", &["--version"]),
    ]
}

fn main() {
    // Pin Windows executable/taskbar resources to the supplied project.X icon.
    tauri_build::try_build(
        tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new().window_icon_path("icons/icon.ico")
        )
    ).expect("Unable to embed the project.X Windows icon");
}

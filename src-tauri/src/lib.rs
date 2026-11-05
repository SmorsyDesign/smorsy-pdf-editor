mod save;
mod system_font;

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            save::write_file_atomic,
            save::is_same_file,
            system_font::read_system_font
        ]);

    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init())
        .setup(|app| {
            // Native dialogs can't be driven by tests, so tests name their own folder.
            use tauri_plugin_fs::FsExt;
            if let Ok(folder) = std::env::var("SMORSY_E2E_DIR") {
                app.fs_scope().allow_directory(folder, true)?;
            }
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("the app could not start");
}

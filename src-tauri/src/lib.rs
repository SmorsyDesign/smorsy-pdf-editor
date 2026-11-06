mod quit;
mod save;
mod system_font;

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            quit::intercept_termination(app.handle());
            #[cfg(feature = "e2e")]
            prepare_for_tests(app)?;
            let _ = app;
            Ok(())
        });

    let builder = builder.invoke_handler(tauri::generate_handler![
        save::write_file_atomic,
        save::is_same_file,
        system_font::read_system_font,
        quit::set_unsaved_work,
        #[cfg(all(feature = "e2e", target_os = "macos"))]
        quit::macos::e2e_request_terminate
    ]);

    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .run(tauri::generate_context!())
        .expect("the app could not start");
}

#[cfg(feature = "e2e")]
fn prepare_for_tests(app: &mut tauri::App) -> tauri::Result<()> {
    // Native dialogs can't be driven by tests, so tests name their own folder.
    use tauri_plugin_fs::FsExt;
    if let Ok(folder) = std::env::var("SMORSY_E2E_DIR") {
        app.fs_scope().allow_directory(folder, true)?;
    }
    // Systems pause rendering in covered windows, which would stall tests run on a
    // computer that's also being used.
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(true)?;
    }
    Ok(())
}

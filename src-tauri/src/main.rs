// Stops a console window opening alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    smorsy_pdf_editor_lib::run()
}

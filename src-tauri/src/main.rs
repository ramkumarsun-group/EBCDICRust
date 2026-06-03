// Prevents a second console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose, Engine as _};
use std::fs;

/// Equivalent of Python's Api.open_file().
/// Returns {name, size, b64} or null if the user cancels.
#[tauri::command]
async fn open_file(window: tauri::Window) -> Option<serde_json::Value> {
    let path = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .set_parent(&window)
        .pick_file()?;

    let data = fs::read(&path).ok()?;
    let b64 = general_purpose::STANDARD.encode(&data);

    Some(serde_json::json!({
        "name": path.file_name()?.to_string_lossy(),
        "size": data.len(),
        "b64":  b64,
    }))
}

/// Open a COBOL copybook file and return its raw text.
/// Returns {name, text} or null if the user cancels.
#[tauri::command]
async fn open_copybook(window: tauri::Window) -> Option<serde_json::Value> {
    let path = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .set_parent(&window)
        .add_filter("COBOL copybook", &["cpy", "cob", "cbl", "cobol", "txt"])
        .pick_file()?;

    let text = fs::read_to_string(&path).ok()?;

    Some(serde_json::json!({
        "name": path.file_name()?.to_string_lossy(),
        "text": text,
    }))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_file, open_copybook])
        .run(tauri::generate_context!())
        .expect("error while running EBCDIC Viewer");
}

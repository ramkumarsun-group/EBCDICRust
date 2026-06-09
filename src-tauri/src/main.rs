// Prevents a second console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ebcdic;

use base64::{engine::general_purpose, Engine as _};
use ebcdic::{
    build_hex_rows, decode_field, ebcdic_char, parse_rdw_records, parse_copybook,
    HexRow, RecordSpan, Copybook, FieldDef,
};
use serde::Serialize;
use std::fs;

// ─────────────────────────────────────────────────────────────────────────────
// File I/O commands (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

/// Open a binary file via the native OS dialog.
/// Returns { name, size, b64 } or null if cancelled.
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
/// Returns { name, text } or null if cancelled.
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

// ─────────────────────────────────────────────────────────────────────────────
// EBCDIC decode commands
// ─────────────────────────────────────────────────────────────────────────────

/// Decode a single byte and return its EBCDIC display character.
#[tauri::command]
fn get_ebcdic_char(byte: u8, codepage: String) -> String {
    ebcdic_char(byte, &codepage)
}

/// Build hex-viewer rows for a window of bytes.
///
/// `b64`      — base64-encoded file bytes
/// `codepage` — e.g. "037", "500", "1047"
/// `offset`   — first byte to include (0-based)
/// `count`    — number of bytes to include
///
/// Returns an array of HexRow objects, each covering 16 bytes.
#[tauri::command]
fn decode_hex_view(
    b64: String,
    codepage: String,
    offset: usize,
    count: usize,
) -> Result<Vec<HexRow>, String> {
    let data = general_purpose::STANDARD.decode(&b64).map_err(|e| e.to_string())?;
    Ok(build_hex_rows(&data, &codepage, offset, count))
}

/// A single decoded field value returned to the frontend.
#[derive(Serialize)]
struct DecodedField {
    name: String,
    value: String,
    hex: String,
}

/// Decode all fields in one record.
///
/// `b64_record` — base64-encoded bytes of the single record (already sliced to record bounds)
/// `fields`     — field descriptors (from a parsed copybook or built-in layout)
/// `codepage`   — EBCDIC code page to use for DISPLAY fields
#[tauri::command]
fn decode_fields(
    b64_record: String,
    fields: Vec<FieldDef>,
    codepage: String,
) -> Result<Vec<DecodedField>, String> {
    let record = general_purpose::STANDARD.decode(&b64_record).map_err(|e| e.to_string())?;
    let mut result = Vec::with_capacity(fields.len());
    for f in &fields {
        let end = (f.offset + f.length).min(record.len());
        let slice = if f.offset < record.len() { &record[f.offset..end] } else { &[] };
        let value = decode_field(slice, &f.field_type, &codepage);
        let hex = slice.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ");
        result.push(DecodedField { name: f.name.clone(), value, hex });
    }
    Ok(result)
}

/// Detect variable-length (RDW) record boundaries in a file.
///
/// Returns an array of { start, end } spans (pointing at record data, not the RDW header),
/// or an empty array if the file does not appear to be variable-blocked.
#[tauri::command]
fn detect_rdw_records(b64: String) -> Result<Vec<RecordSpan>, String> {
    let data = general_purpose::STANDARD.decode(&b64).map_err(|e| e.to_string())?;
    Ok(parse_rdw_records(&data).unwrap_or_default())
}

/// Parse a COBOL copybook text string and return the structured layout.
#[tauri::command]
fn parse_copybook_text(text: String, fallback_name: String) -> Copybook {
    parse_copybook(&text, &fallback_name)
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // File I/O
            open_file,
            open_copybook,
            // EBCDIC decode / hex view
            get_ebcdic_char,
            decode_hex_view,
            decode_fields,
            detect_rdw_records,
            parse_copybook_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running EBCDIC Viewer");
}

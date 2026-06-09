// ebcdic.rs — EBCDIC code page tables and all decode/encode logic
//
// This module replaces everything that was previously in web/data.jsx:
//   • Code page tables (CP-037, CP-1047, CP-500, CP-273, CP-285, CP-297, CP-1140)
//   • ebcdic_char / decode_display
//   • decode_zoned / decode_packed / decode_binary / decode_field
//   • parse_rdw_records
//   • parse_copybook (COBOL copybook parser)

use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Code page tables — each is a [&str; 256] mapping byte → UTF-8 string
// The string is empty for control/undefined positions.
// ─────────────────────────────────────────────────────────────────────────────

static CP037: [&str; 256] = [
    // 0x0_
    " ","","","","","\t","","",
    "","","","","\x0C","\r","","",
    // 0x1_
    "","","","","","","\x08","",
    "","","","","","","","",
    // 0x2_
    "","","","","","\n","","",
    "","","","","","","","",
    // 0x3_
    "","","","","","","","",
    "","","","","","","","",
    // 0x4_
    " "," ","â","ä","à","á","ã","å","ç","ñ","¢",".","<","(","+","|",
    // 0x5_
    "&","é","ê","ë","è","í","î","ï","ì","ß","!","$","*",")",";","¬",
    // 0x6_
    "-","/","Â","Ä","À","Á","Ã","Å","Ç","Ñ","¦",",","%","_",">","?",
    // 0x7_
    "ø","É","Ê","Ë","È","Í","Î","Ï","Ì","`",":","#","@","'","=\"","\"",
    // 0x8_
    "Ø","a","b","c","d","e","f","g","h","i","«","»","ð","ý","þ","±",
    // 0x9_
    "°","j","k","l","m","n","o","p","q","r","ª","º","æ","¸","Æ","¤",
    // 0xA_
    "µ","~","s","t","u","v","w","x","y","z","¡","¿","Ð","Ý","Þ","®",
    // 0xB_
    "^","£","¥","·","©","§","¶","¼","½","¾","[","]","¯","¨","´","×",
    // 0xC_
    "{","A","B","C","D","E","F","G","H","I","\u{00AD}","ô","ö","ò","ó","õ",
    // 0xD_
    "}","J","K","L","M","N","O","P","Q","R","¹","û","ü","ù","ú","ÿ",
    // 0xE_
    "\\","÷","S","T","U","V","W","X","Y","Z","²","Ô","Ö","Ò","Ó","Õ",
    // 0xF_
    "0","1","2","3","4","5","6","7","8","9","³","Û","Ü","Ù","Ú","",
];

static CP1047: [&str; 256] = [
    // 0x0_
    " ","","","","","\t","","",
    "","","","","\x0C","\r","","",
    // 0x1_
    "","","","","","","\x08","",
    "","","","","","","","",
    // 0x2_
    "","","","","","","","",   // 0x15 = '' (not \n)
    "","","","","","","","",
    // 0x3_
    "","","","","","","","",
    "","","","","","","","",
    // 0x4_
    " "," ","â","ä","à","á","ã","å","ç","ñ","¢",".","<","(","+","!",  // 0x4F = !
    // 0x5_
    "&","é","ê","ë","è","í","î","ï","ì","ß","]","$","*",")",";","^",  // 0x5A=] 0x5F=^
    // 0x6_
    "-","/","Â","Ä","À","Á","Ã","Å","Ç","Ñ","¦",",","%","_",">","?",
    // 0x7_
    "ø","É","Ê","Ë","È","Í","Î","Ï","Ì","`",":","#","@","'","=\"","\"",
    // 0x8_
    "Ø","a","b","c","d","e","f","g","h","i","«","»","ð","ý","þ","±",
    // 0x9_
    "°","j","k","l","m","n","o","p","q","r","ª","º","æ","¸","Æ","¤",
    // 0xA_
    "µ","~","s","t","u","v","w","x","y","z","¡","¿","Ð","Ý","Þ","®",
    // 0xB_
    "¬","£","¥","·","©","§","¶","¼","½","¾","[","]","¯","¨","´","×", // 0xB0=¬
    // 0xC_
    "{","A","B","C","D","E","F","G","H","I","\u{00AD}","ô","ö","ò","ó","õ",
    // 0xD_
    "}","J","K","L","M","N","O","P","Q","R","¹","û","ü","ù","ú","ÿ",
    // 0xE_
    "\\","÷","S","T","U","V","W","X","Y","Z","²","Ô","Ö","Ò","Ó","Õ",
    // 0xF_
    "0","1","2","3","4","5","6","7","8","9","³","Û","Ü","Ù","Ú","",
];

static CP500: [&str; 256] = [
    // 0x0_
    "","","","","","\t","","","","","","","\x0C","\r","","",
    // 0x1_
    "","","","","","","\x08","","","","","","","","","",
    // 0x2_
    "","","","","","\n","","","","","","","","","","",
    // 0x3_
    "","","","","","","","","","","","","","","","",
    // 0x4_
    " "," ","â","ä","à","á","ã","å","ç","ñ","[",".","<","(","+","!",
    // 0x5_
    "&","é","ê","ë","è","í","î","ï","ì","ß","]","$","*",")",";","^",
    // 0x6_
    "-","/","Â","Ä","À","Á","Ã","Å","Ç","Ñ","¦",",","%","_",">","?",
    // 0x7_
    "ø","É","Ê","Ë","È","Í","Î","Ï","Ì","`",":","#","@","'","=","\"",
    // 0x8_
    "Ø","a","b","c","d","e","f","g","h","i","«","»","ð","ý","þ","±",
    // 0x9_
    "°","j","k","l","m","n","o","p","q","r","ª","º","æ","¸","Æ","¤",
    // 0xA_
    "µ","~","s","t","u","v","w","x","y","z","¡","¿","Ð","Ý","Þ","®",
    // 0xB_
    "¢","£","¥","·","©","§","¶","¼","½","¾","¬","|","¯","¨","´","×",
    // 0xC_
    "{","A","B","C","D","E","F","G","H","I","\u{00AD}","ô","ö","ò","ó","õ",
    // 0xD_
    "}","J","K","L","M","N","O","P","Q","R","¹","û","ü","ù","ú","ÿ",
    // 0xE_
    "\\","÷","S","T","U","V","W","X","Y","Z","²","Ô","Ö","Ò","Ó","Õ",
    // 0xF_
    "0","1","2","3","4","5","6","7","8","9","³","Û","Ü","Ù","Ú","",
];

static CP273: [&str; 256] = [
    // 0x0_
    "","","","","","\t","","","","","","","\x0C","\r","","",
    // 0x1_
    "","","","","","","\x08","","","","","","","","","",
    // 0x2_
    "","","","","","\n","","","","","","","","","","",
    // 0x3_
    "","","","","","","","","","","","","","","","",
    // 0x4_
    " "," ","â","{","à","á","ã","å","ç","ñ","Ä",".","<","(","+","!",
    // 0x5_
    "&","é","ê","ë","è","í","î","ï","ì","~","Ü","$","*",")",";","^",
    // 0x6_
    "-","/","Â","[","À","Á","Ã","Å","Ç","Ñ","ö",",","%","_",">","?",
    // 0x7_
    "ø","É","Ê","Ë","È","Í","Î","Ï","Ì","`",":","#","§","'","=","\"",
    // 0x8_
    "Ø","a","b","c","d","e","f","g","h","i","«","»","ð","ý","þ","±",
    // 0x9_
    "°","j","k","l","m","n","o","p","q","r","ª","º","æ","¸","Æ","¤",
    // 0xA_
    "µ","ß","s","t","u","v","w","x","y","z","¡","¿","Ð","Ý","Þ","®",
    // 0xB_
    "¢","£","¥","·","©","@","¶","¼","½","¾","¬","|","‾","¨","´","×",
    // 0xC_
    "ä","A","B","C","D","E","F","G","H","I","\u{00AD}","ô","¦","ò","ó","õ",
    // 0xD_
    "ü","J","K","L","M","N","O","P","Q","R","¹","û","}","ù","ú","ÿ",
    // 0xE_
    "Ö","÷","S","T","U","V","W","X","Y","Z","²","Ô","\\","Ò","Ó","Õ",
    // 0xF_
    "0","1","2","3","4","5","6","7","8","9","³","Û","]","Ù","Ú","",
];

static CP285: [&str; 256] = [
    // 0x0_
    "","","","","","\t","","","","","","","\x0C","\r","","",
    // 0x1_
    "","","","","","","\x08","","","","","","","","","",
    // 0x2_
    "","","","","","\n","","","","","","","","","","",
    // 0x3_
    "","","","","","","","","","","","","","","","",
    // 0x4_
    " "," ","â","ä","à","á","ã","å","ç","ñ","$",".","<","(","+","|",
    // 0x5_
    "&","é","ê","ë","è","í","î","ï","ì","ß","!","£","*",")",";","¬",
    // 0x6_
    "-","/","Â","Ä","À","Á","Ã","Å","Ç","Ñ","¦",",","%","_",">","?",
    // 0x7_
    "ø","É","Ê","Ë","È","Í","Î","Ï","Ì","`",":","#","@","'","=","\"",
    // 0x8_
    "Ø","a","b","c","d","e","f","g","h","i","«","»","ð","ý","þ","±",
    // 0x9_
    "°","j","k","l","m","n","o","p","q","r","ª","º","æ","¸","Æ","¤",
    // 0xA_
    "µ","~","s","t","u","v","w","x","y","z","¡","¿","Ð","Ý","Þ","®",
    // 0xB_
    "¢","[","¥","·","©","§","¶","¼","½","¾","^","]","¯","¨","´","×",
    // 0xC_
    "{","A","B","C","D","E","F","G","H","I","\u{00AD}","ô","ö","ò","ó","õ",
    // 0xD_
    "}","J","K","L","M","N","O","P","Q","R","¹","û","ü","ù","ú","ÿ",
    // 0xE_
    "\\","÷","S","T","U","V","W","X","Y","Z","²","Ô","Ö","Ò","Ó","Õ",
    // 0xF_
    "0","1","2","3","4","5","6","7","8","9","³","Û","Ü","Ù","Ú","",
];

static CP297: [&str; 256] = [
    // 0x0_
    "","","","","","\t","","","","","","","\x0C","\r","","",
    // 0x1_
    "","","","","","","\x08","","","","","","","","","",
    // 0x2_
    "","","","","","\n","","","","","","","","","","",
    // 0x3_
    "","","","","","","","","","","","","","","","",
    // 0x4_
    " "," ","â","ä","@","á","ã","å","\\","ñ","°",".","<","(","+","!",
    // 0x5_
    "&","{","ê","ë","}","í","î","ï","ì","ß","§","$","*",")",";","^",
    // 0x6_
    "-","/","Â","Ä","À","Á","Ã","Å","Ç","Ñ","ù",",","%","_",">","?",
    // 0x7_
    "ø","É","Ê","Ë","È","Í","Î","Ï","Ì","µ",":","£","à","'","=","\"",
    // 0x8_
    "Ø","a","b","c","d","e","f","g","h","i","«","»","ð","ý","þ","±",
    // 0x9_
    "[","j","k","l","m","n","o","p","q","r","ª","º","æ","¸","Æ","¤",
    // 0xA_
    "`","¨","s","t","u","v","w","x","y","z","¡","¿","Ð","Ý","Þ","®",
    // 0xB_
    "¢","#","¥","·","©","]","¶","¼","½","¾","¬","|","‾","~","´","×",
    // 0xC_
    "é","A","B","C","D","E","F","G","H","I","\u{00AD}","ô","ö","ò","ó","õ",
    // 0xD_
    "è","J","K","L","M","N","O","P","Q","R","¹","û","ü","¦","ú","ÿ",
    // 0xE_
    "ç","÷","S","T","U","V","W","X","Y","Z","²","Ô","Ö","Ò","Ó","Õ",
    // 0xF_
    "0","1","2","3","4","5","6","7","8","9","³","Û","Ü","Ù","Ú","",
];

static CP1140: [&str; 256] = [
    // 0x0_
    "","","","","","\t","","","","","","","\x0C","\r","","",
    // 0x1_
    "","","","","","","\x08","","","","","","","","","",
    // 0x2_
    "","","","","","\n","","","","","","","","","","",
    // 0x3_
    "","","","","","","","","","","","","","","","",
    // 0x4_
    " "," ","â","ä","à","á","ã","å","ç","ñ","¢",".","<","(","+","|",
    // 0x5_
    "&","é","ê","ë","è","í","î","ï","ì","ß","!","$","*",")",";","¬",
    // 0x6_
    "-","/","Â","Ä","À","Á","Ã","Å","Ç","Ñ","¦",",","%","_",">","?",
    // 0x7_
    "ø","É","Ê","Ë","È","Í","Î","Ï","Ì","`",":","#","@","'","=","\"",
    // 0x8_
    "Ø","a","b","c","d","e","f","g","h","i","«","»","ð","ý","þ","±",
    // 0x9_
    "°","j","k","l","m","n","o","p","q","r","ª","º","æ","¸","Æ","€",  // 0x9F = €
    // 0xA_
    "µ","~","s","t","u","v","w","x","y","z","¡","¿","Ð","Ý","Þ","®",
    // 0xB_
    "^","£","¥","·","©","§","¶","¼","½","¾","[","]","¯","¨","´","×",
    // 0xC_
    "{","A","B","C","D","E","F","G","H","I","\u{00AD}","ô","ö","ò","ó","õ",
    // 0xD_
    "}","J","K","L","M","N","O","P","Q","R","¹","û","ü","ù","ú","ÿ",
    // 0xE_
    "\\","÷","S","T","U","V","W","X","Y","Z","²","Ô","Ö","Ò","Ó","Õ",
    // 0xF_
    "0","1","2","3","4","5","6","7","8","9","³","Û","Ü","Ù","Ú","",
];

/// Return the table for the given code page ID string. Defaults to CP037.
pub fn get_table(codepage: &str) -> &'static [&'static str; 256] {
    match codepage {
        "1047" => &CP1047,
        "500"  => &CP500,
        "273"  => &CP273,
        "285"  => &CP285,
        "297"  => &CP297,
        "1140" => &CP1140,
        _      => &CP037,
    }
}

/// Decode a single byte to its display character. Returns '·' for non-printable.
pub fn ebcdic_char(b: u8, codepage: &str) -> String {
    let table = get_table(codepage);
    let s = table[b as usize];
    if s.is_empty() {
        return "·".to_string();
    }
    let ch = s.chars().next().unwrap();
    let cp = ch as u32;
    if cp >= 0x20 && cp <= 0x7E {
        ch.to_string()
    } else if cp >= 0xA0 {
        ch.to_string()
    } else {
        "·".to_string()
    }
}

/// Decode a byte slice as EBCDIC display text (PIC X). Trailing spaces trimmed.
pub fn decode_display(bytes: &[u8], codepage: &str) -> String {
    let table = get_table(codepage);
    let mut s = String::with_capacity(bytes.len());
    for &b in bytes {
        let mapped = table[b as usize];
        if mapped.is_empty() {
            s.push(' ');
        } else {
            let ch = mapped.chars().next().unwrap();
            if ch as u32 >= 0x20 {
                s.push(ch);
            } else {
                s.push(' ');
            }
        }
    }
    // Trim trailing spaces
    s.trim_end().to_string()
}

/// Decode zoned decimal (PIC 9 / PIC S9).
pub fn decode_zoned(bytes: &[u8], decimals: usize) -> String {
    let mut digits = String::new();
    let mut sign = '+';
    for (i, &b) in bytes.iter().enumerate() {
        let lo = b & 0x0F;
        digits.push(char::from_digit(lo as u32, 10).unwrap_or('0'));
        if i == bytes.len() - 1 {
            let hi = b >> 4;
            if hi == 0xD {
                sign = '-';
            }
        }
    }
    insert_decimal(digits, decimals, sign == '-')
}

/// Decode packed decimal COMP-3 (e.g. PIC 9(7)V99 COMP-3).
pub fn decode_packed(bytes: &[u8], decimals: usize) -> String {
    let mut digits = String::new();
    for (i, &b) in bytes.iter().enumerate() {
        digits.push(char::from_digit((b >> 4) as u32, 10).unwrap_or('0'));
        if i < bytes.len() - 1 {
            digits.push(char::from_digit((b & 0x0F) as u32, 10).unwrap_or('0'));
        }
    }
    let sign_nibble = bytes.last().map(|b| b & 0x0F).unwrap_or(0xC);
    let negative = sign_nibble == 0xD;

    // Strip leading zeros
    let trimmed = digits.trim_start_matches('0');
    let digits = if trimmed.is_empty() { "0".to_string() } else { trimmed.to_string() };

    insert_decimal(digits, decimals, negative)
}

/// Decode binary (COMP / COMP-4 / COMP-5).
pub fn decode_binary(bytes: &[u8], signed: bool) -> String {
    let mut n: i64 = 0;
    for &b in bytes {
        n = n * 256 + b as i64;
    }
    if signed && bytes.first().map(|&b| b & 0x80 != 0).unwrap_or(false) {
        let width = bytes.len();
        n -= 256_i64.pow(width as u32);
    }
    n.to_string()
}

/// Insert a decimal point at the right position and apply sign.
fn insert_decimal(mut digits: String, decimals: usize, negative: bool) -> String {
    if decimals > 0 {
        if digits.len() <= decimals {
            let pad = "0".repeat(decimals - digits.len());
            digits = format!("0.{}{}", pad, digits);
        } else {
            let split = digits.len() - decimals;
            digits.insert(split, '.');
        }
    }
    if negative {
        format!("-{}", digits)
    } else {
        digits
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Field descriptor (matches the JS FieldDef shape from app.jsx)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct FieldDef {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub offset: usize,
    pub length: usize,
    pub level: u8,
    #[serde(default)]
    pub variant: Option<String>,
    #[serde(default)]
    pub redefines: Option<String>,
    #[serde(default, rename = "odoGroup")]
    pub odo_group: Option<usize>,
    #[serde(default, rename = "occurrenceIndex")]
    pub occurrence_index: Option<usize>,
}

/// Decode a single field given its bytes.
pub fn decode_field(bytes: &[u8], field_type: &str, codepage: &str) -> String {
    let ft = field_type.to_uppercase();
    if ft.contains("COMP-3") || ft.contains("PACKED") {
        let dec = count_v_digits(&ft);
        return decode_packed(bytes, dec);
    }
    if ft.contains("COMP") {
        let signed = ft.contains("S9");
        return decode_binary(bytes, signed);
    }
    if ft.contains("PIC 9") || ft.contains("PIC S9") {
        let dec = count_v_digits(&ft);
        return decode_zoned(bytes, dec);
    }
    decode_display(bytes, codepage)
}

/// Count implied decimal digits from a PIC string (the digits after V).
fn count_v_digits(pic: &str) -> usize {
    // e.g. "PIC 9(7)V99 COMP-3" → 2
    if let Some(pos) = pic.find('V') {
        let after = &pic[pos + 1..];
        // Could be V99 or V9(2)
        let mut count = 0usize;
        let mut chars = after.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '9' {
                // Check for (n) repetition
                if chars.peek() == Some(&'(') {
                    chars.next(); // consume '('
                    let mut n_str = String::new();
                    for c2 in chars.by_ref() {
                        if c2 == ')' { break; }
                        n_str.push(c2);
                    }
                    count += n_str.parse::<usize>().unwrap_or(1);
                } else {
                    count += 1;
                }
            } else {
                break;
            }
        }
        return count;
    }
    0
}

// ─────────────────────────────────────────────────────────────────────────────
// Hex view row
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Debug)]
pub struct HexRow {
    pub offset: usize,
    pub hex: Vec<String>,
    pub ebcdic: Vec<String>,
    pub ascii: Vec<String>,
}

/// Build hex-view rows for `count` bytes starting at `offset` in `data`.
/// Each row covers 16 bytes. Missing bytes at the end are padded with empty strings.
pub fn build_hex_rows(data: &[u8], codepage: &str, offset: usize, count: usize) -> Vec<HexRow> {
    let end = (offset + count).min(data.len());
    let slice = &data[offset..end];
    let mut rows = Vec::new();
    let mut i = 0;
    while i < slice.len() {
        let row_offset = offset + i;
        let mut hex_cells = Vec::with_capacity(16);
        let mut ebcdic_cells = Vec::with_capacity(16);
        let mut ascii_cells = Vec::with_capacity(16);
        for col in 0..16 {
            if i + col < slice.len() {
                let b = slice[i + col];
                hex_cells.push(format!("{:02X}", b));
                ebcdic_cells.push(ebcdic_char(b, codepage));
                ascii_cells.push(ascii_char(b));
            } else {
                hex_cells.push(String::new());
                ebcdic_cells.push(String::new());
                ascii_cells.push(String::new());
            }
        }
        rows.push(HexRow {
            offset: row_offset,
            hex: hex_cells,
            ebcdic: ebcdic_cells,
            ascii: ascii_cells,
        });
        i += 16;
    }
    rows
}

fn ascii_char(b: u8) -> String {
    if b >= 0x20 && b <= 0x7E {
        (b as char).to_string()
    } else {
        "·".to_string()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RDW (Record Descriptor Word) parser
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Debug, Clone)]
pub struct RecordSpan {
    pub start: usize,
    pub end: usize,
}

/// Try to parse the bytes as IBM RDW (big-endian total length in bytes 0-1) or
/// cobrix LE-data format (little-endian data length in bytes 2-3).
/// Returns the winning spans, or None if neither format cleanly parses the file.
pub fn parse_rdw_records(data: &[u8]) -> Option<Vec<RecordSpan>> {
    let ibm = try_rdw(data, false);
    let le  = try_rdw(data, true);
    let best = if ibm.1 >= le.1 { ibm } else { le };
    if best.0.is_empty() { return None; }
    if best.1 + 16 < data.len() { return None; }
    Some(best.0)
}

fn try_rdw(data: &[u8], le_data: bool) -> (Vec<RecordSpan>, usize) {
    let mut spans = Vec::new();
    let mut i = 0usize;
    while i + 4 <= data.len() {
        let (data_start, data_end, next_i) = if le_data {
            let data_len = (data[i + 2] as usize) | ((data[i + 3] as usize) << 8);
            if data_len < 1 || i + 4 + data_len > data.len() { break; }
            (i + 4, i + 4 + data_len, i + 4 + data_len)
        } else {
            let total_len = ((data[i] as usize) << 8) | data[i + 1] as usize;
            if total_len < 5 || i + total_len > data.len() { break; }
            (i + 4, i + total_len, i + total_len)
        };
        spans.push(RecordSpan { start: data_start, end: data_end });
        i = next_i;
    }
    (spans, i)
}

// ─────────────────────────────────────────────────────────────────────────────
// COBOL copybook parser
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CopybookField {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub offset: usize,
    pub length: usize,
    pub level: u8,
    #[serde(default)]
    pub variant: Option<String>,
    #[serde(default)]
    pub redefines: Option<String>,
    #[serde(default, rename = "odoGroup")]
    pub odo_group: Option<usize>,
    #[serde(default, rename = "occurrenceIndex")]
    pub occurrence_index: Option<usize>,
}

#[derive(Serialize, Clone, Debug)]
pub struct OdoGroup {
    #[serde(rename = "groupName")]
    pub group_name: String,
    #[serde(rename = "controlFieldName")]
    pub control_field_name: String,
    #[serde(rename = "controlOffset")]
    pub control_offset: i64,
    #[serde(rename = "controlLength")]
    pub control_length: i64,
    #[serde(rename = "controlType")]
    pub control_type: String,
    #[serde(rename = "baseOffset")]
    pub base_offset: usize,
    #[serde(rename = "maxOccurs")]
    pub max_occurs: usize,
    #[serde(rename = "occurrenceLength")]
    pub occurrence_length: usize,
}

#[derive(Serialize, Debug)]
pub struct Copybook {
    pub name: String,
    #[serde(rename = "recordLength")]
    pub record_length: usize,
    pub source: String,
    pub fields: Vec<CopybookField>,
    #[serde(rename = "odoGroups")]
    pub odo_groups: Vec<OdoGroup>,
}

#[derive(Clone, Debug)]
struct Item {
    level: u8,
    name: String,
    pic: Option<String>,
    _usage: String,
    occurs: usize,
    redefines: Option<String>,
    length: usize,
    field_type: String,
    depending_on_field: Option<String>,
}

/// Parse a COBOL copybook text and return the structured layout.
pub fn parse_copybook(text: &str, fallback_name: &str) -> Copybook {
    // 1. Detect fixed vs free format
    let raw_lines: Vec<&str> = text.split('\n').collect();
    let is_fixed = raw_lines.iter().any(|l| {
        l.len() > 72 || (l.len() >= 7 && (l.as_bytes().get(6) == Some(&b'*') || l.as_bytes().get(6) == Some(&b'/')))
    });

    // 2. Strip sequence areas and comments
    let mut code_lines: Vec<String> = Vec::new();
    for ln in &raw_lines {
        let ln = ln.trim_end_matches('\r');
        let s: String = if is_fixed {
            if ln.len() >= 7 {
                let ind = ln.as_bytes()[6];
                if ind == b'*' || ind == b'/' { continue; }
                ln.chars().skip(7).take(72 - 7).collect()
            } else if ln.len() > 6 {
                ln.chars().skip(7).collect()
            } else {
                String::new()
            }
        } else {
            let t = ln.trim_start();
            if t.starts_with("*>") || t.starts_with('*') { continue; }
            ln.to_string()
        };
        if !s.trim().is_empty() {
            code_lines.push(s);
        }
    }

    // 3. Join and split on '.'
    let blob = code_lines.join(" ");
    let raw_statements: Vec<&str> = blob.split('.').collect();

    // 4. Parse each statement into an Item
    let mut items: Vec<Item> = Vec::new();
    for st in &raw_statements {
        let st = st.trim();
        if st.is_empty() { continue; }
        let toks: Vec<&str> = st.split_whitespace().collect();
        if toks.len() < 2 { continue; }
        let level: u8 = match toks[0].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        if level == 88 || level == 66 { continue; }
        let name = toks[1].to_string();
        let rest = toks[2..].join(" ");
        let rest_u = rest.to_uppercase();

        // PIC clause
        let pic = parse_pic_clause(&rest_u);

        let is_comp3 = rest_u.contains("COMP-3") || rest_u.contains("PACKED-DECIMAL");
        let is_comp = !is_comp3 && (rest_u.contains("COMP") || rest_u.contains("BINARY")
            || rest_u.contains("COMP-4") || rest_u.contains("COMP-5"));

        let occurs = parse_occurs(&rest_u);
        let depending_on_field = parse_depending_on(&rest_u);
        let redefines = parse_redefines(&rest_u);

        let usage = if is_comp3 { "COMP-3".to_string() }
                    else if is_comp { "COMP".to_string() }
                    else { "DISPLAY".to_string() };

        let (length, field_type) = if let Some(ref p) = pic {
            let digits = pic_digits(p);
            let len = if usage == "COMP" {
                if digits <= 4 { 2 } else if digits <= 9 { 4 } else { 8 }
            } else if usage == "COMP-3" {
                digits / 2 + 1
            } else {
                digits
            };
            let type_str = format!("PIC {}{}", p,
                if usage == "COMP-3" { " COMP-3" } else if usage == "COMP" { " COMP" } else { "" });
            (len, type_str)
        } else {
            (0, String::new())
        };

        items.push(Item { level, name, pic, _usage: usage, occurs, redefines, length, field_type, depending_on_field });
    }

    if items.is_empty() {
        return Copybook { name: fallback_name.to_string(), record_length: 0, source: text.to_string(), fields: Vec::new(), odo_groups: Vec::new() };
    }

    // 5. Tree walk
    let mut fields: Vec<CopybookField> = Vec::new();
    let mut odo_groups: Vec<OdoGroup> = Vec::new();
    let mut name_offsets: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    let root_level = items[0].level;
    let root_name = items[0].name.clone();

    let record_length = if items.len() > 1 && items[1].level > root_level && items[0].pic.is_none() {
        walk_items(&items, 1, root_level, 0, None, &mut fields, &mut odo_groups, &mut name_offsets)
    } else {
        walk_items(&items, 0, root_level - 1, 0, None, &mut fields, &mut odo_groups, &mut name_offsets)
    };

    // Resolve ODO control field offsets
    for grp in &mut odo_groups {
        if let Some(ctrl) = fields.iter().find(|f| f.name == grp.control_field_name && f.odo_group.is_none()) {
            grp.control_offset = ctrl.offset as i64;
            grp.control_length = ctrl.length as i64;
            grp.control_type = ctrl.field_type.clone();
        }
    }

    // Sort fields: fixed first by offset (primary before variant), then ODO by occurrence
    fields.sort_by(|a, b| {
        let a_odo = a.odo_group.is_some();
        let b_odo = b.odo_group.is_some();
        match (a_odo, b_odo) {
            (false, false) => a.offset.cmp(&b.offset).then(a.variant.is_some().cmp(&b.variant.is_some())),
            (true, true) => {
                a.odo_group.cmp(&b.odo_group)
                    .then(a.occurrence_index.cmp(&b.occurrence_index))
                    .then(a.offset.cmp(&b.offset))
            }
            (false, true) => std::cmp::Ordering::Less,
            (true, false) => std::cmp::Ordering::Greater,
        }
    });

    Copybook { name: root_name, record_length, source: text.to_string(), fields, odo_groups }
}

fn walk_items(
    items: &[Item],
    start: usize,
    parent_level: u8,
    base_offset: usize,
    inherited_variant: Option<String>,
    fields: &mut Vec<CopybookField>,
    odo_groups: &mut Vec<OdoGroup>,
    name_offsets: &mut std::collections::HashMap<String, usize>,
) -> usize {
    let mut i = start;
    let mut cursor = base_offset;

    while i < items.len() && items[i].level > parent_level {
        let it = &items[i];

        // Find children
        let mut child_end = i + 1;
        while child_end < items.len() && items[child_end].level > it.level {
            child_end += 1;
        }
        let has_children = child_end > i + 1;

        let is_redef = it.redefines.is_some();
        let is_odo = it.depending_on_field.is_some() && has_children && it.pic.is_none();

        let my_offset = if is_redef {
            it.redefines.as_ref()
                .and_then(|r| name_offsets.get(r.as_str()))
                .copied()
                .unwrap_or(cursor)
        } else {
            cursor
        };
        name_offsets.insert(it.name.clone(), my_offset);

        let my_variant = inherited_variant.clone().or_else(|| {
            if is_redef {
                Some(format!("{} REDEFINES {}", it.name, it.redefines.as_ref().unwrap()))
            } else {
                None
            }
        });

        let item_length;

        if is_odo {
            // ODO group: walk one occurrence
            let template_start = fields.len();
            let one_len = walk_items(items, i + 1, it.level, my_offset, my_variant.clone(), fields, odo_groups, name_offsets);
            let template_fields: Vec<CopybookField> = fields.drain(template_start..).collect();

            let odo_idx = odo_groups.len();
            odo_groups.push(OdoGroup {
                group_name: it.name.clone(),
                control_field_name: it.depending_on_field.clone().unwrap_or_default(),
                control_offset: -1,
                control_length: -1,
                control_type: String::new(),
                base_offset: my_offset,
                max_occurs: it.occurs,
                occurrence_length: one_len,
            });

            for occ in 0..it.occurs {
                for tf in &template_fields {
                    fields.push(CopybookField {
                        offset: tf.offset + occ * one_len,
                        odo_group: Some(odo_idx),
                        occurrence_index: Some(occ),
                        ..tf.clone()
                    });
                }
            }
            item_length = 0;

        } else if has_children && it.pic.is_none() {
            let child_len = walk_items(items, i + 1, it.level, my_offset, my_variant.clone(), fields, odo_groups, name_offsets);
            item_length = child_len * it.occurs.max(1);

        } else if it.pic.is_some() {
            let occurs_str = if it.occurs > 1 && it.depending_on_field.is_none() {
                format!(" OCCURS {}", it.occurs)
            } else {
                String::new()
            };
            fields.push(CopybookField {
                name: it.name.clone(),
                field_type: format!("{}{}", it.field_type, occurs_str),
                offset: my_offset,
                length: it.length,
                level: it.level,
                variant: my_variant.clone(),
                redefines: it.redefines.clone(),
                odo_group: None,
                occurrence_index: None,
            });
            item_length = it.length * it.occurs.max(1);
        } else {
            item_length = 0;
        }

        if !is_redef && !is_odo {
            cursor += item_length;
        }
        i = child_end;
    }

    cursor - base_offset
}

// ── Copybook parsing helpers ──────────────────────────────────────────────────

fn parse_pic_clause(rest_u: &str) -> Option<String> {
    // Match PIC IS xxx or PICTURE IS xxx
    let re_start = rest_u.find("PIC").or_else(|| rest_u.find("PICTURE"))?;
    let after = &rest_u[re_start..];
    let toks: Vec<&str> = after.split_whitespace().collect();
    // toks[0] = "PIC" or "PICTURE", toks[1] = "IS" or the pic string
    if toks.len() < 2 { return None; }
    let pic_str = if toks[1] == "IS" { toks.get(2)? } else { toks[1] };
    Some(pic_str.to_string())
}

fn parse_occurs(rest_u: &str) -> usize {
    if let Some(pos) = rest_u.find("OCCURS") {
        let after = rest_u[pos + 6..].trim_start();
        let num: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        num.parse().unwrap_or(1)
    } else {
        1
    }
}

fn parse_depending_on(rest_u: &str) -> Option<String> {
    let pos = rest_u.find("DEPENDING")?;
    let after = rest_u[pos..].split_whitespace().collect::<Vec<_>>();
    // "DEPENDING ON <name>"
    if after.len() >= 3 && after[1] == "ON" {
        Some(after[2].to_string())
    } else {
        None
    }
}

fn parse_redefines(rest_u: &str) -> Option<String> {
    let pos = rest_u.find("REDEFINES")?;
    let after = &rest_u[pos + 9..];
    let name: String = after.trim_start().split_whitespace().next()?.to_string();
    Some(name)
}

/// Count the number of byte positions in a PIC string.
/// X(10) → 10, 9(5) → 5, S9(4) → 4, 9(7)V99 → 9
pub fn pic_digits(pic: &str) -> usize {
    let s = pic.to_uppercase();
    let s = s.trim_start_matches('S');
    // Remove V and everything up to next char class boundary
    let s = s.replace('V', "");
    // Expand (n): X(10) → XXXXXXXXXX
    let mut result = 0usize;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == 'X' || c == '9' || c == 'A' {
            if chars.peek() == Some(&'(') {
                chars.next(); // '('
                let mut n_str = String::new();
                for c2 in chars.by_ref() {
                    if c2 == ')' { break; }
                    n_str.push(c2);
                }
                result += n_str.parse::<usize>().unwrap_or(1);
            } else {
                result += 1;
            }
        }
    }
    result
}

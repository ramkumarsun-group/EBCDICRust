# EBCDIC Viewer — Rust / Tauri

Tauri rewrite of the original pywebview-based EBCDIC Viewer.
The entire `web/` layer is unchanged; only `app.jsx` line ~186 is updated to
call `window.__TAURI__.invoke('open_file')` instead of `window.pywebview.api.open_file()`.

## Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri CLI
cargo install tauri-cli

# Node.js (needed only by Tauri's build toolchain)
brew install node
```

## Dev run

```bash
cd src-tauri
cargo tauri dev
```

## Release build

```bash
cd src-tauri
cargo tauri build
# Output: src-tauri/target/release/bundle/macos/EBCDIC Viewer.app
```

## App icons

Generate all required sizes from a single 1024×1024 PNG:

```bash
cargo tauri icon path/to/icon-1024.png
# Writes to src-tauri/icons/
```

## What changed vs. the Python version

| Item | Status |
|------|--------|
| `web/data.jsx` | ✅ Unchanged |
| `web/settings.jsx` | ✅ Unchanged |
| `web/index.html` | ✅ Unchanged |
| `web/vendor/` | ✅ Unchanged |
| `web/app.jsx` | ✅ One line changed (`pywebview.api` → `__TAURI__.invoke`) |
| `main.py` / pywebview | ❌ Replaced by `src-tauri/src/main.rs` |
| `setup.py` / `build.sh` | ❌ Replaced by `cargo tauri build` |

## Bundle size

| Build | Size |
|-------|------|
| py2app `.app` (original) | ~87 MB |
| Tauri `.app` (this) | ~8–12 MB |

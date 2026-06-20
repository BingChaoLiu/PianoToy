use std::fs;
use std::path::PathBuf;
use tauri::Manager;

mod midi;
use midi::MidiState;

#[tauri::command]
fn read_midi_bytes(path: String) -> Result<Vec<u8>, String> {
    let p = PathBuf::from(&path);
    fs::read(&p).map_err(|e| format!("failed to read {}: {}", p.display(), e))
}

#[tauri::command]
fn save_midi_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    fs::write(&p, &bytes).map_err(|e| format!("failed to write {}: {}", p.display(), e))
}

/// Absolute path to the scores root directory, created if missing.
/// Layout: <appLocalDataDir>/scores/
#[tauri::command]
fn get_scores_root(app: tauri::AppHandle) -> Result<String, String> {
    let root = scores_root(&app)?;
    fs::create_dir_all(&root)
        .map_err(|e| format!("create_dir_all {} failed: {}", root.display(), e))?;
    Ok(root.to_string_lossy().into_owned())
}

/// Validate that a folder name is a safe single path segment.
/// Rejects `..`, absolute paths, separators, and anything outside [A-Za-z0-9_-].
fn validate_folder_name(folder: &str) -> Result<(), String> {
    if folder.is_empty()
        || folder.starts_with('.')
        || folder.contains(std::path::MAIN_SEPARATOR)
        || !folder
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("invalid folder name: {}", folder));
    }
    Ok(())
}

/// Resolve `<appLocalDataDir>/scores` (without creating it). Centralized so the
/// "scores" segment name lives in one place.
fn scores_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir failed: {}", e))?;
    Ok(base.join("scores"))
}

/// Canonicalize `root/folder` and verify it stays inside `root` (no escape via `..`/symlinks).
fn safe_join(root: &std::path::Path, folder: &str) -> Result<PathBuf, String> {
    validate_folder_name(folder)?;
    let target = root.join(folder);
    let canon = target
        .canonicalize()
        .map_err(|e| format!("canonicalize {} failed: {}", target.display(), e))?;
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("canonicalize root {} failed: {}", root.display(), e))?;
    if !canon.starts_with(&root_canon) {
        return Err(format!("path escapes scores root: {}", canon.display()));
    }
    Ok(canon)
}

/// Scan the scores root, returning the raw meta.json contents of every valid folder.
/// Folders without a valid meta.json or missing song.mid are skipped (not fatal).
#[tauri::command]
fn list_score_folders(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let root = scores_root(&app)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(&root)
        .map_err(|e| format!("read_dir {} failed: {}", root.display(), e))?;
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let folder_name = match dir.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Skip the migration marker file (it's a file, but be defensive).
        if folder_name.starts_with('.') {
            continue;
        }
        let meta_path = dir.join("meta.json");
        let song_path = dir.join("song.mid");
        if !meta_path.exists() || !song_path.exists() {
            continue;
        }
        match fs::read_to_string(&meta_path) {
            Ok(content) => out.push(content),
            Err(_) => continue, // skip unreadable meta
        }
    }
    Ok(out)
}

/// Delete an entire score folder (song.mid, score.pdf, meta.json).
#[tauri::command]
fn delete_score_folder(app: tauri::AppHandle, folder: String) -> Result<(), String> {
    let root = scores_root(&app)?;
    if !root.exists() {
        return Ok(()); // nothing to delete
    }
    let target = safe_join(&root, &folder)?;
    fs::remove_dir_all(&target)
        .map_err(|e| format!("remove_dir_all {} failed: {}", target.display(), e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(MidiState::default())
    .invoke_handler(tauri::generate_handler![
      read_midi_bytes,
      save_midi_bytes,
      midi::list_native_midi_inputs,
      midi::start_native_midi_listen,
      midi::stop_native_midi_listen,
      midi::native_midi_available,
      get_scores_root,
      list_score_folders,
      delete_score_folder,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

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
    // Create the parent directory tree first — fs::write only creates the file
    // itself. Score writes target <scores>/<folder>/song.mid where the per-score
    // folder may not exist yet (it is never created by any other command), so
    // without this the first write fails with OS error 3 (path not found).
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {} failed: {}", parent.display(), e))?;
    }
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

/// Windows reserved folder names (case-insensitive). We refuse them so the
/// directory can actually be created on Windows.
const WINDOWS_RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6",
    "com7", "com8", "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6",
    "lpt7", "lpt8", "lpt9",
];

/// Validate that a folder name is a safe single path segment.
/// Rejects `..`, absolute paths, separators, Windows reserved names, and any
/// character that is not alphanumeric (unicode-aware) / dash / underscore.
fn validate_folder_name(folder: &str) -> Result<(), String> {
    if folder.is_empty()
        || folder.starts_with('.')
        || folder.contains(std::path::MAIN_SEPARATOR)
        || WINDOWS_RESERVED.iter().any(|r| r.eq_ignore_ascii_case(folder))
        || !folder
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
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
/// A folder is valid when it has a meta.json AND at least one playable source file:
/// either song.mid (MIDI imports) or score.musicxml (MusicXML imports). Folders
/// without a valid meta.json or any source file are skipped (not fatal).
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
        let midi_path = dir.join("song.mid");
        let musicxml_path = dir.join("score.musicxml");
        let has_source = midi_path.exists() || musicxml_path.exists();
        if !meta_path.exists() || !has_source {
            continue;
        }
        match fs::read_to_string(&meta_path) {
            Ok(content) => out.push(content),
            Err(_) => continue, // skip unreadable meta
        }
    }
    Ok(out)
}

/// Delete an entire score folder (song.mid, score.musicxml, meta.json).
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

/// Resolve `<appLocalDataDir>/progress.json` — the note-reading trainer's
/// SM-2 card-state file. Fixed filename (not user input), so unlike the scores
/// folder there is no folder-name validation or path-escape check to do.
fn progress_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir failed: {}", e))?;
    Ok(base.join("progress.json"))
}

/// Read the raw bytes of progress.json. Returns an empty vector if the file
/// does not exist yet (fresh learner); the JS layer treats empty as "no state".
#[tauri::command]
fn read_progress(app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    let p = progress_path(&app)?;
    if !p.exists() {
        return Ok(Vec::new());
    }
    fs::read(&p).map_err(|e| format!("failed to read {}: {}", p.display(), e))
}

/// Write progress.json, creating the app-local-data dir if needed (it usually
/// already exists because the scores root is created on first score import,
/// but a note-reading-only user may never have imported a score).
#[tauri::command]
fn save_progress(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    let p = progress_path(&app)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all {} failed: {}", parent.display(), e))?;
    }
    fs::write(&p, &bytes).map_err(|e| format!("failed to write {}: {}", p.display(), e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
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
      read_progress,
      save_progress,
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

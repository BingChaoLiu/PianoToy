use std::fs;
use std::path::PathBuf;

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

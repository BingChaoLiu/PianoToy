//! Native MIDI backend (midir).
//!
//! Provides Tauri commands to enumerate MIDI input ports and forward
//! received messages to the frontend via the `native-midi-message` event.
//! Acts as an alternative to Web MIDI for lower latency / better device
//! enumeration on Windows.

use std::sync::Mutex;

use midir::{MidiInput, MidiInputConnection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

const CLIENT_NAME: &str = "piano-visualizer";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeMidiDevice {
    /// Stable id, formatted as "native:<port_name>".
    pub id: String,
    /// Human-readable port name returned by the OS.
    pub name: String,
}

#[derive(Serialize, Clone)]
struct MidiMessage {
    status: u8,
    d1: u8,
    d2: u8,
}

/// Holds the active native MIDI connection across invocations.
#[derive(Default)]
pub struct MidiState {
    connection: Mutex<Option<MidiInputConnection<()>>>,
}

/// Enumerate native MIDI input ports.
#[tauri::command]
pub fn list_native_midi_inputs() -> Result<Vec<NativeMidiDevice>, String> {
    let midi_in = MidiInput::new(CLIENT_NAME).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(midi_in.port_count());
    for port in midi_in.ports() {
        let name = midi_in
            .port_name(&port)
            .unwrap_or_else(|_| "<unknown>".to_string());
        out.push(NativeMidiDevice {
            id: format!("native:{}", name),
            name,
        });
    }
    Ok(out)
}

/// Open a native MIDI input by port name and start forwarding events.
#[tauri::command]
pub fn start_native_midi_listen(
    app: AppHandle,
    name: String,
    state: State<'_, MidiState>,
) -> Result<(), String> {
    let mut guard = state.connection.lock().map_err(|e| e.to_string())?;
    if let Some(prev) = guard.take() {
        let _ = prev.close();
    }

    let midi_in = MidiInput::new(CLIENT_NAME).map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    let port_index = ports
        .iter()
        .position(|p| midi_in.port_name(p).ok().as_deref() == Some(name.as_str()))
        .ok_or_else(|| format!("MIDI input port {:?} not found", name))?;
    let port = &ports[port_index];

    let app_handle = app.clone();
    let conn = midi_in
        .connect(
            port,
            "input",
            move |_ts, bytes, _data| {
                if bytes.is_empty() {
                    return;
                }
                let status = bytes[0];
                let d1 = bytes.get(1).copied().unwrap_or(0);
                let d2 = bytes.get(2).copied().unwrap_or(0);
                let _ = app_handle.emit(
                    "native-midi-message",
                    MidiMessage { status, d1, d2 },
                );
            },
            (),
        )
        .map_err(|e| format!("connect failed: {}", e))?;

    *guard = Some(conn);
    Ok(())
}

/// Close the active native MIDI input, if any.
#[tauri::command]
pub fn stop_native_midi_listen(state: State<'_, MidiState>) -> Result<(), String> {
    let mut guard = state.connection.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = guard.take() {
        let _ = conn.close();
    }
    Ok(())
}

/// Returns true if a native MIDI subsystem could be initialised.
#[tauri::command]
pub fn native_midi_available() -> bool {
    MidiInput::new(CLIENT_NAME).is_ok()
}

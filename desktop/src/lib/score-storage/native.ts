// Tauri command wrappers for the scores filesystem.
// All folder-name arguments go through assertFolder (isValidFolderName) here,
// which is the ONLY guard for read/write paths — the Rust save_midi_bytes /
// read_midi_bytes commands accept an arbitrary absolute path and do NOT re-run
// validate_folder_name/safe_join. (delete_score_folder does validate on the
// Rust side too, but read/write do not.)

import { invoke } from "@tauri-apps/api/core";
import { isValidFolderName } from "./slug";
import { isNative } from "./env";
import {
  MIDI_FILENAME,
  PDF_FILENAME,
  META_FILENAME,
  type ScoreMeta,
} from "./types";

// Re-exported so existing `import { isNative } from "./native"` callers keep
// working; the real (Tauri-free) implementation lives in ./env.
export { isNative };

function assertFolder(folder: string): void {
  if (!isValidFolderName(folder)) {
    throw new Error(`invalid score folder name: ${folder}`);
  }
}

/** Return the scores root absolute path, creating it if missing. */
export async function getScoresRoot(): Promise<string> {
  return invoke<string>("get_scores_root");
}

/** Read the raw meta.json strings of every valid score folder. */
export async function listScoreFoldersRaw(): Promise<string[]> {
  return invoke<string[]>("list_score_folders");
}

/** Delete an entire score folder. */
export async function deleteScoreFolderNative(folder: string): Promise<void> {
  assertFolder(folder);
  await invoke<void>("delete_score_folder", { folder });
}

/** Write bytes to a file inside a score folder (song.mid / score.pdf / meta.json). */
async function writeFile(folder: string, filename: string, bytes: Uint8Array): Promise<void> {
  assertFolder(folder);
  const root = await getScoresRoot();
  // Reuse the existing per-path save command.
  await invoke<void>("save_midi_bytes", {
    path: `${root}/${folder}/${filename}`,
    bytes: Array.from(bytes),
  });
}

/** Read bytes of a file inside a score folder. */
export async function readScoreFileBytes(folder: string, filename: string): Promise<Uint8Array> {
  assertFolder(folder);
  const root = await getScoresRoot();
  const arr = await invoke<number[]>("read_midi_bytes", {
    path: `${root}/${folder}/${filename}`,
  });
  return new Uint8Array(arr);
}

export async function writeMidi(folder: string, bytes: Uint8Array): Promise<void> {
  await writeFile(folder, MIDI_FILENAME, bytes);
}

export async function writePdf(folder: string, bytes: Uint8Array): Promise<void> {
  await writeFile(folder, PDF_FILENAME, bytes);
}

export async function writeMeta(folder: string, meta: ScoreMeta): Promise<void> {
  await writeFile(folder, META_FILENAME, new TextEncoder().encode(JSON.stringify(meta, null, 2)));
}

export async function readMeta(folder: string): Promise<ScoreMeta | null> {
  try {
    const bytes = await readScoreFileBytes(folder, META_FILENAME);
    return JSON.parse(new TextDecoder().decode(bytes)) as ScoreMeta;
  } catch {
    return null;
  }
}

export async function readMidi(folder: string): Promise<Uint8Array> {
  return readScoreFileBytes(folder, MIDI_FILENAME);
}

export async function readPdf(folder: string): Promise<Uint8Array | null> {
  try {
    return await readScoreFileBytes(folder, PDF_FILENAME);
  } catch {
    return null;
  }
}

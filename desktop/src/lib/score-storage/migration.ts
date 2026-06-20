// One-time migration of legacy IndexedDB MIDI storage (midi-storage.ts) to the
// file-system scores layout. Idempotent via a `.migrated` marker file: if the
// marker exists, migration is skipped. The old DB is only cleared AFTER the
// marker is written, so a crash mid-migration leaves old data intact and the
// next launch retries (folders already written are deduped by id).

import { invoke } from "@tauri-apps/api/core";
import { isNative } from "./env";
import { importScoreToFolder, listScores } from "./index";
import { slugify } from "./slug";
import { MIGRATED_MARKER } from "./types";
import { loadAllMidi, clearAllMidi } from "@/lib/midi-storage";
import { parseSmf } from "@/lib/smf-parser";

export interface MigrationResult {
  skipped: boolean;
  migrated: number;
  failed: number;
}

/** True if the .migrated marker exists in the scores root (native only). */
async function hasMarker(): Promise<boolean> {
  if (!isNative()) return false;
  const root = await invoke<string>("get_scores_root");
  try {
    await invoke<number[]>("read_midi_bytes", { path: `${root}/${MIGRATED_MARKER}` });
    return true;
  } catch {
    return false;
  }
}

/** Write the .migrated marker so the next launch skips migration. */
async function setMarker(): Promise<void> {
  if (!isNative()) return;
  const root = await invoke<string>("get_scores_root");
  await invoke<void>("save_midi_bytes", {
    path: `${root}/${MIGRATED_MARKER}`,
    bytes: Array.from(new TextEncoder().encode("1")),
  });
}

/**
 * Derive a friendly name for a legacy `custom-<timestamp>` id. Legacy ids
 * carried no name, so reuse the timestamp as the display name.
 */
function nameFromLegacyId(id: string): string {
  const m = id.match(/^custom-(.+)$/);
  return m ? m[1] : id;
}

/**
 * Derive a new folder id from a legacy id, preserving the timestamp so on-disk
 * ordering matches import order.
 */
function folderFromLegacyId(id: string): string {
  const m = id.match(/^custom-(\d+)$/);
  // Use the embedded timestamp when present; otherwise fall back to a
  // deterministic value derived from the id (NOT Date.now(), which would break
  // dedup across retry runs for non-standard ids).
  const ts = m ? m[1] : slugify(id);
  const slug = slugify(nameFromLegacyId(id));
  return `${ts}-${slug}`;
}

/** Run the migration. Safe to call on every app launch. */
export async function migrateIndexedDbToFs(): Promise<MigrationResult> {
  // Migration targets the real filesystem, so it only runs under Tauri. In a
  // plain browser there is no filesystem destination and the legacy IndexedDB
  // store IS the storage, so migrating would only copy data into itself.
  if (!isNative()) {
    return { skipped: true, migrated: 0, failed: 0 };
  }
  if (await hasMarker()) {
    return { skipped: true, migrated: 0, failed: 0 };
  }

  // Avoid migrating folders that already exist (from a partial previous run).
  const existing = new Set((await listScores()).map((m) => m.id));

  let oldEntries: { id: string; bytes: Uint8Array }[] = [];
  try {
    oldEntries = await loadAllMidi();
  } catch {
    oldEntries = []; // no legacy db — nothing to migrate
  }

  let migrated = 0;
  let failed = 0;
  for (const entry of oldEntries) {
    const folder = folderFromLegacyId(entry.id);
    if (existing.has(folder)) {
      migrated++; // already migrated in a prior partial run
      continue;
    }
    try {
      let duration = 0;
      let noteCount = 0;
      try {
        const song = parseSmf(entry.bytes);
        duration = song.duration;
        noteCount = song.notes.length;
      } catch {
        // keep defaults if parse fails
      }
      await importScoreToFolder(
        {
          midiBytes: entry.bytes,
          name: nameFromLegacyId(entry.id),
          duration,
          noteCount,
          tempo: 120,
        },
        folder,
      );
      migrated++;
    } catch (err) {
      console.error(`[migration] failed for ${entry.id}:`, err);
      failed++;
    }
  }

  // Only stamp the marker and clear the old DB when all records were attempted.
  // If setMarker fails, do NOT clear the old DB so the next launch retries.
  try {
    await setMarker();
  } catch (err) {
    console.error("[migration] failed to write marker; old DB kept intact", err);
    return { skipped: false, migrated, failed };
  }

  try {
    await clearAllMidi();
  } catch (err) {
    console.error("[migration] failed to clear old DB (non-fatal)", err);
  }

  return { skipped: false, migrated, failed };
}

// Types for the file-system-backed score storage.

/** How a score was imported. Determines parse path on load. */
export type ScoreSourceFormat = "midi" | "musicxml";

/** Raw shape of meta.json on disk. */
export interface ScoreMeta {
  schemaVersion: number;
  id: string;
  name: string;
  composer: string;
  difficulty: string;
  category: "custom";
  midiFile: string;
  duration: number;
  noteCount: number;
  tempo: number;
  timeSignature: string;
  addedAt: number;
  /** Source format. Older metas (pre-schema v3) default to "midi". */
  sourceFormat?: ScoreSourceFormat;
  /** Present only when sourceFormat is "musicxml" (the engraving source). */
  musicXmlFile?: string;
}

export const META_SCHEMA_VERSION = 3;

export const MIDI_FILENAME = "song.mid";
export const MUSICXML_FILENAME = "score.musicxml";
export const META_FILENAME = "meta.json";
export const MIGRATED_MARKER = ".migrated";

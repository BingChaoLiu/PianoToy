// MIDI types

export interface Note {
  start: number;     // seconds since song start
  duration: number;  // seconds
  midi: number;
  velocity: number;
  track?: number;
  /** transient scheduling flag */
  _scheduled?: boolean;
  /** practice: hit by user input */
  _matched?: boolean;
  /** practice: missed the hit window */
  _missed?: boolean;
  /** practice: timing delta vs ideal (seconds, positive = late) */
  _deltaTime?: number | null;
}

export interface TrackMeta {
  index: number;
  name?: string;
  channel?: number;
}

export interface Song {
  name: string;
  duration: number;
  notes: Note[];
  tracks: TrackMeta[];
  /** SMF source bytes for export/re-export */
  source?: Uint8Array;
}

export interface LoadedMidi {
  name: string;
  bytes: Uint8Array;
}

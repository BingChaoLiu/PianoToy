//  1.5s practice  synth
//  schedulePlayback (L1449-1465)  practice  mute 

import type { Song } from "@/types/midi";
import { scheduleOscsAt } from "@/lib/synth";
import { getAudioContext } from "@/lib/audio-context";
import type { PlaybackState } from "@/store/usePlaybackStore";

export function schedulePlayback(
  song: Song, pb: PlaybackState, demoAudio: boolean, synthEnabled: boolean,
): void {
  const ctx = getAudioContext();
  if (!ctx || !pb.isPlaying) return;
  const startT = pb.playStartSongT;
  const winEndSong = pb.currentSongTime(song) + 1.5;
  // demoAudio is decided by the caller per mode: in score practice it follows
  // the listen-only (original audio) toggle; elsewhere it mirrors the original
  // "play demo when not in challenge/hit-detection mode" behaviour.
  const soundOn = synthEnabled && demoAudio;
  for (const note of song.notes) {
    if (note._scheduled) continue;
    if (note.start + note.duration <= startT) {
      note._scheduled = true;
      continue;
    }
    const playAt = Math.max(note.start, startT);
    if (playAt > winEndSong) continue;
    const ctxTime = pb.playStartCtx + (playAt - startT) / pb.tempoScale;
    const dur = note.duration / pb.tempoScale;
    if (soundOn) {
      scheduleOscsAt(note.midi, note.velocity, ctxTime, dur, { registerLive: false });
    }
    note._scheduled = true;
  }
}

/** seek  _scheduled "" */
export function resetScheduledFlags(song: Song, songT: number): void {
  for (const n of song.notes) {
    n._scheduled = (n.start + n.duration) <= songT;
  }
}

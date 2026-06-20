// Standard MIDI File format 0 / 1
//  web ? parseMidiFile (L817-947) 

import type { Note, Song, TrackMeta } from "@/types/midi";
import { FIRST_MIDI, LAST_MIDI } from "@/lib/note-utils";

interface Reader {
  u8: Uint8Array;
  p: number;
}

function readU32(r: Reader): number {
  const { u8, p } = r;
  const v = (u8[p] << 24) | (u8[p+1] << 16) | (u8[p+2] << 8) | u8[p+3];
  r.p += 4;
  return v >>> 0;
}

function readU16(r: Reader): number {
  const { u8, p } = r;
  const v = (u8[p] << 8) | u8[p+1];
  r.p += 2;
  return v;
}

function readStr(r: Reader, n: number): string {
  const { u8, p } = r;
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p + i]);
  r.p += n;
  return s;
}

function readVarLen(r: Reader): number {
  let v = 0;
  for (let i = 0; i < 4; i++) {
    const b = r.u8[r.p++];
    v = (v << 7) | (b & 0x7f);
    if (!(b & 0x80)) return v;
  }
  return v;
}

interface RawNoteEvent {
  track: number;
  channel: number;
  midi: number;
  startTick: number;
  endTick: number;
  velocity: number;
}

export function parseSmf(buffer: ArrayBuffer | Uint8Array): Song {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const r: Reader = { u8, p: 0 };

  if (readStr(r, 4) !== "MThd") throw new Error("not a MIDI file (no MThd)");
  const hdrLen = readU32(r);
  if (hdrLen < 6) throw new Error("bad MThd length");
  const _format = readU16(r); void _format;
  const ntrks = readU16(r);
  const div = readU16(r);
  r.p += (hdrLen - 6);
  const ppqn: number | null = (div & 0x8000) ? null : div;
  if (!ppqn) throw new Error("SMPTE timing not supported");

  const tempoEvents: Array<{ tick: number; usPerQuarter: number }> = [];
  const noteEvents: RawNoteEvent[] = [];
  // key = track<<16 | channel<<8 | note  ?  startTick
  const pending = new Map<number, number>();
  // companion map: key + 0.5 ? saved velocity (use fractional key to avoid string ops)
  const pendingVel = new Map<number, number>();
  const trackNames: string[] = [];

  for (let t = 0; t < ntrks; t++) {
   if (readStr(r, 4) !== "MTrk") throw new Error(`expected MTrk at track ${t}`);
    const trkLen = readU32(r);
    const trkEnd = r.p + trkLen;
    let tick = 0;
    let runningStatus = 0;
    let sawNameThisTrack = false;
    while (r.p < trkEnd) {
      const delta = readVarLen(r);
      tick += delta;
      let status = r.u8[r.p];
      if (status < 0x80) {
        status = runningStatus;
      } else {
        r.p++;
        runningStatus = status;
      }
      const cmd = status & 0xf0;
      const ch = status & 0x0f;
      if (cmd === 0x80 || (cmd === 0x90 && r.u8[r.p + 1] === 0)) {
        const note = r.u8[r.p]; const vel = r.u8[r.p + 1]; r.p += 2;
        const key = (t << 16) | (ch << 8) | note;
        const startT = pending.get(key);
        if (startT !== undefined) {
          const savedVel = pendingVel.get(key) ?? vel;
          noteEvents.push({ track: t, channel: ch, midi: note, startTick: startT, endTick: tick, velocity: savedVel });
          pending.delete(key);
          pendingVel.delete(key);
        }
      } else if (cmd === 0x90) {
        const note = r.u8[r.p]; const vel = r.u8[r.p + 1]; r.p += 2;
        const key = (t << 16) | (ch << 8) | note;
        pending.set(key, tick);
        pendingVel.set(key, vel);
      } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
        r.p += 2;
      } else if (cmd === 0xc0 || cmd === 0xd0) {
        r.p += 1;
      } else if (status === 0xff) {
        const metaType = r.u8[r.p++];
        const len = readVarLen(r);
        if (metaType === 0x51 && len === 3) {
          const us = (r.u8[r.p] << 16) | (r.u8[r.p + 1] << 8) | r.u8[r.p + 2];
          tempoEvents.push({ tick, usPerQuarter: us });
        } else if (metaType === 0x03 && !sawNameThisTrack) {
          // TrackName
          let name = "";
          for (let i = 0; i < len; i++) name += String.fromCharCode(r.u8[r.p + i]);
          trackNames[t] = name;
          sawNameThisTrack = true;
        }
        r.p += len;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(r);
        r.p += len;
      } else {
        break;
      }
    }
    r.p = trkEnd;
  }

  // Close any notes still open (give them a quarter duration)
  for (const [key, startT] of pending) {
    const note = key & 0xff;
    const ch = (key >> 8) & 0xff;
    const trk = (key >> 16) & 0xff;
    const vel = pendingVel.get(key) ?? 96;
    noteEvents.push({ track: trk, channel: ch, midi: note, startTick: startT, endTick: startT + ppqn!, velocity: vel });
  }

  // Tempo map (tick ? seconds)
  tempoEvents.sort((a, b) => a.tick - b.tick);
  if (tempoEvents.length === 0 || tempoEvents[0].tick !== 0) {
    tempoEvents.unshift({ tick: 0, usPerQuarter: 500000 });
  }
  function tickToSec(tick: number): number {
    let sec = 0;
    let lastTick = 0;
    let curUs = tempoEvents[0].usPerQuarter;
    for (let i = 0; i < tempoEvents.length; i++) {
      const ev = tempoEvents[i];
      if (ev.tick > tick) break;
      sec += ((ev.tick - lastTick) * curUs) / ppqn! / 1e6;
      lastTick = ev.tick;
      curUs = ev.usPerQuarter;
    }
    sec += ((tick - lastTick) * curUs) / ppqn! / 1e6;
    return sec;
  }

  const notes: Note[] = noteEvents
    .filter((n) => n.midi >= FIRST_MIDI && n.midi <= LAST_MIDI)
    .map((n) => ({
      midi: n.midi,
      start: tickToSec(n.startTick),
      duration: Math.max(0.05, tickToSec(n.endTick) - tickToSec(n.startTick)),
      velocity: n.velocity || 96,
      track: n.track,
    }))
    .sort((a, b) => a.start - b.start);

  const duration = notes.length
    ? notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0)
    : 0;

  const tracks: TrackMeta[] = [];
  for (let i = 0; i < ntrks; i++) {
    tracks.push({ index: i, name: trackNames[i] });
  }

  return {
    name: "MIDI ·",
    duration,
    notes,
    tracks,
  };
}

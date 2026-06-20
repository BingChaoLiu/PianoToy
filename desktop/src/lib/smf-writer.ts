// Standard MIDI File writer: format 0, single track, default 480 PPQN, 120 BPM.
// 1:1 port of encodeMidiFile() from ../index.html.

import type { Note } from "@/types/midi";

export function encodeSmf(notes: Note[], ppqn = 480): Uint8Array {
  const usPerQuarter = 500000;
  const ticksPerSec = (ppqn * 1e6) / usPerQuarter;
  const secToTick = (s: number) => Math.max(0, Math.round(s * ticksPerSec));

  // Build event list (note on/off pairs) and sort by tick; offs before ons at the same tick.
  type Ev = { tick: number; type: "on" | "off"; midi: number; velocity: number };
  const evs: Ev[] = [];
  for (const n of notes) {
    const startTick = secToTick(n.start);
    const endTick = Math.max(startTick + 1, secToTick(n.start + n.duration));
    evs.push({ tick: startTick, type: "on", midi: n.midi, velocity: n.velocity || 96 });
    evs.push({ tick: endTick, type: "off", midi: n.midi, velocity: 0 });
  }
  evs.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type !== b.type) return a.type === "off" ? -1 : 1;
    return 0;
  });

  // Variable-length quantity
  const vl = (n: number): number[] => {
    const buf = [n & 0x7f];
    let v = n >> 7;
    while (v > 0) {
      buf.unshift((v & 0x7f) | 0x80);
      v >>= 7;
    }
    return buf;
  };

  const body: number[] = [];
  let lastTick = 0;
  for (const ev of evs) {
    const dt = ev.tick - lastTick;
    lastTick = ev.tick;
    for (const b of vl(dt)) body.push(b);
    if (ev.type === "on") {
      body.push(0x90, ev.midi & 0x7f, ev.velocity & 0x7f);
    } else {
      body.push(0x80, ev.midi & 0x7f, 0x00);
    }
  }
  // End of track meta
  for (const b of vl(0)) body.push(b);
  body.push(0xff, 0x2f, 0x00);

  const out: number[] = [];
  // MThd
  out.push(0x4d, 0x54, 0x68, 0x64);
  out.push(0, 0, 0, 6);
  out.push(0, 0);                 // format 0
  out.push(0, 1);                 // 1 track
  out.push((ppqn >> 8) & 0xff, ppqn & 0xff);
  // MTrk
  out.push(0x4d, 0x54, 0x72, 0x6b);
  out.push(
    (body.length >> 24) & 0xff,
    (body.length >> 16) & 0xff,
    (body.length >> 8) & 0xff,
    body.length & 0xff,
  );
  for (const b of body) out.push(b & 0xff);
  return new Uint8Array(out);
}

// Web MIDI list + subscribe null fallback?

import type {
  MidiAccess, MidiInput, MidiMessageEvent,
} from "@/types/webmidi";

export type { MidiAccess, MidiInput, MidiMessageEvent, MidiConnectionEvent, MidiPort } from "@/types/webmidi";

export type MidiSource = "web" | "native";

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer?: string;
  source: MidiSource;
}

export interface MidiHandle {
  access: MidiAccess;
  inputs: MidiInputInfo[];
}

interface NavigatorMaybeWithMidi {
  requestMIDIAccess?(options?: { sysex?: boolean }): Promise<MidiAccess>;
}

function nav(): NavigatorMaybeWithMidi {
  return navigator as unknown as NavigatorMaybeWithMidi;
}

/** ? Web MIDI ? inputs map map  forEach  iterator */
function inputsArray(access: MidiAccess): MidiInput[] {
  const out: MidiInput[] = [];
  access.inputs.forEach((inp) => { out.push(inp); });
  return out;
}

export async function openMidi(): Promise<MidiHandle | null> {
  const fn = nav().requestMIDIAccess;
  if (!fn) return null;
  try {
    const access = await fn.call(nav());
    return { access, inputs: collectInputs(access) };
  } catch {
    return null;
  }
}

export function collectInputs(access: MidiAccess): MidiInputInfo[] {
  return inputsArray(access).map((inp) => ({
    id: inp.id,
    name: inp.name ?? inp.id,
    manufacturer: inp.manufacturer,
    source: "web",
  }));
}

export function subscribeInput(
  access: MidiAccess, id: string, cb: (e: MidiMessageEvent) => void,
): boolean {
  const all = inputsArray(access);
  let target: MidiInput | null = null;
  for (const inp of all) {
    if (inp.id === id) target = inp;
    else inp.onmidimessage = null;
  }
  if (!target) return false;
  target.onmidimessage = cb;
  return true;
}

export function unsubscribeAll(access: MidiAccess): void {
  for (const inp of inputsArray(access)) {
    inp.onmidimessage = null;
  }
}

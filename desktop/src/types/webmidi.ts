// Web MIDI API TS  DOM lib 
//  DOM  MIDI*  lib.dom 

export interface MidiInputMap {
  forEach(cb: (input: MidiInput) => void): void;
  size: number;
}

export interface MidiAccess {
  inputs: MidiInputMap;
  outputs: unknown;
  sysexEnabled: boolean;
  onstatechange: ((ev: MidiConnectionEvent) => unknown) | null;
}

export interface MidiMessageEvent {
  data: Uint8Array;
}

export interface MidiPort {
  id: string;
  manufacturer?: string;
  name?: string;
  type: "input" | "output";
  state: "connected" | "disconnected";
  connection: "open" | "closed" | "pending";
  onstatechange: ((ev: MidiConnectionEvent) => unknown) | null;
}

export interface MidiInput extends MidiPort {
  onmidimessage: ((ev: MidiMessageEvent) => unknown) | null;
}

export interface MidiConnectionEvent {
  port?: MidiPort;
}

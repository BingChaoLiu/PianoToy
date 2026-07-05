// Tests for the MIDI→MusicXML converter facade.
//
// The facade spawns a real Web Worker via `new Worker(new URL("./worker.ts", import.meta.url))`.
// Under Vitest + happy-dom there's no real worker runtime, so we replace the
// global Worker constructor with a fake that captures the message handler and
// lets each test drive responses synchronously. This verifies the facade's
// request/response correlation, stage callbacks, error propagation, and
// worker-reuse semantics without booting the ~23 MB webmscore WASM.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convertMidiToMusicXml, destroyConverter, type ConvertStage } from "@/lib/midi-converter";

// --- Fake Worker ------------------------------------------------------------

interface FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null;
  addEventListener: (type: string, cb: (e: MessageEvent) => void) => void;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  terminate: () => void;
}

let fakeWorker: FakeWorker | null = null;
let postHandler: ((msg: any) => void) | null = null;
let messageListeners: Array<(e: MessageEvent) => void> = [];

class WorkerShim {
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor() {
    // The facade attaches listeners via addEventListener, not onmessage.
    fakeWorker = this as unknown as FakeWorker;
    (this as any).addEventListener = (type: string, cb: (e: MessageEvent) => void) => {
      if (type === "message") messageListeners.push(cb);
    };
    (this as any).postMessage = (msg: unknown) => {
      // Route to the test's installed handler (which decides what to reply).
      if (postHandler) postHandler(msg);
    };
    (this as any).terminate = () => {
      fakeWorker = null;
      messageListeners = [];
    };
  }
}

function emitFromWorker(payload: unknown) {
  for (const cb of messageListeners) {
    cb({ data: payload } as MessageEvent);
  }
}

beforeEach(() => {
  (globalThis as any).Worker = WorkerShim;
  fakeWorker = null;
  postHandler = null;
  messageListeners = [];
});

afterEach(() => {
  destroyConverter();
  delete (globalThis as any).Worker;
});

describe("convertMidiToMusicXml", () => {
  it("resolves with MusicXML text on a successful conversion", async () => {
    postHandler = (msg: any) => {
      expect(msg.type).toBe("convert");
      expect(msg.midiBytes).toBeInstanceOf(Uint8Array);
      // Simulate the worker replying.
      emitFromWorker({ id: msg.id, ok: true, musicXml: "<score-partwise/>" });
    };
    const xml = await convertMidiToMusicXml(new Uint8Array([1, 2, 3]));
    expect(xml).toBe("<score-partwise/>");
  });

  it("rejects when the worker reports an error", async () => {
    postHandler = (msg: any) => {
      emitFromWorker({ id: msg.id, ok: false, error: "bad midi" });
    };
    await expect(convertMidiToMusicXml(new Uint8Array([0]))).rejects.toThrow("bad midi");
  });

  it("reports the loading-converter stage on the first call", async () => {
    const stages: ConvertStage[] = [];
    postHandler = (msg: any) => {
      emitFromWorker({ id: msg.id, ok: true, musicXml: "<x/>" });
    };
    await convertMidiToMusicXml(new Uint8Array([1]), {
      onStage: (s) => stages.push(s),
    });
    // First run MUST surface loading-converter (the cold-start UX contract).
    expect(stages[0]).toBe("loading-converter");
    expect(stages).toContain("converting");
  });

  it("skips loading-converter on subsequent calls (warm worker)", async () => {
    postHandler = (msg: any) => {
      emitFromWorker({ id: msg.id, ok: true, musicXml: "<x/>" });
    };
    // Prime the worker.
    await convertMidiToMusicXml(new Uint8Array([1]));
    const secondStages: ConvertStage[] = [];
    await convertMidiToMusicXml(new Uint8Array([2]), {
      onStage: (s) => secondStages.push(s),
    });
    expect(secondStages).not.toContain("loading-converter");
    expect(secondStages).toContain("converting");
  });

  it("reuses the same worker instance across calls", async () => {
    postHandler = (msg: any) => emitFromWorker({ id: msg.id, ok: true, musicXml: "<x/>" });
    await convertMidiToMusicXml(new Uint8Array([1]));
    const first = fakeWorker;
    await convertMidiToMusicXml(new Uint8Array([2]));
    expect(fakeWorker).toBe(first);
  });

  it("correlates responses by id and ignores stray ids", async () => {
    postHandler = (msg: any) => {
      // Emit a response for a WRONG id first, then the right one.
      emitFromWorker({ id: 99999, ok: true, musicXml: "<wrong/>" });
      emitFromWorker({ id: msg.id, ok: true, musicXml: "<right/>" });
    };
    const xml = await convertMidiToMusicXml(new Uint8Array([1]));
    expect(xml).toBe("<right/>");
  });
});

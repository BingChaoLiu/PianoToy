import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Minimal SMF builder (same shape as smf-parser.test.ts) ----------------

function varlen(v: number): number[] {
  const bytes: number[] = [];
  let buf = v & 0x7f;
  while ((v >>>= 7) > 0) {
    buf <<= 8;
    buf |= (v & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buf & 0xff);
    if (buf & 0x80) buf >>>= 8;
    else break;
  }
  return bytes;
}

/** format-0 SMF, 1 track, two notes (C4, E4). */
function buildMinimalSmf(): Uint8Array {
  const head = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
  ];
  const events: number[] = [];
  events.push(...varlen(0), 0x90, 0x3c, 0x60);
  events.push(...varlen(480), 0x90, 0x3c, 0x00);
  events.push(...varlen(0), 0x90, 0x40, 0x64);
  events.push(...varlen(960), 0x90, 0x40, 0x00);
  events.push(...varlen(0), 0xff, 0x2f, 0x00);
  const trk = [0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, events.length, ...events];
  return new Uint8Array([...head, ...trk]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const FAKE_SMF = buildMinimalSmf();
const FAKE_SMF_B64 = bytesToBase64(FAKE_SMF);

// --- Mocks -----------------------------------------------------------------

// The toolkit instance returned to the parser. Tracks loadData input + lets
// tests flip loadData/renderToMIDI to simulate failures.
const mockToolkit = {
  loadDataInput: "",
  loadDataReturn: true as boolean,
  renderReturn: FAKE_SMF_B64 as string,
  loadData(data: string): boolean {
    this.loadDataInput = data;
    return this.loadDataReturn;
  },
  renderToMIDI(): string {
    return this.renderReturn;
  },
};

vi.mock("verovio/wasm", () => ({
  // The WASM module factory resolves to a module object; the parser only passes
  // it through to the toolkit constructor, so a plain object is fine here.
  default: async () => ({}),
}));
vi.mock("verovio/esm", () => ({
  VerovioToolkit: class {
    constructor() {
      return mockToolkit;
    }
  },
}));

import { parseMusicXml, resetMusicXmlToolkit } from "@/lib/musicxml-parser";

const VALID_MXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure></part>
</score-partwise>`;

describe("parseMusicXml", () => {
  beforeEach(() => {
    mockToolkit.loadDataInput = "";
    mockToolkit.loadDataReturn = true;
    mockToolkit.renderReturn = FAKE_SMF_B64;
    resetMusicXmlToolkit();
  });

  it("parses valid MusicXML into a Song with notes", async () => {
    const song = await parseMusicXml(new TextEncoder().encode(VALID_MXML));
    expect(song.notes).toHaveLength(2);
    expect(song.notes[0].midi).toBe(60); // C4
    expect(song.notes[1].midi).toBe(64); // E4
    expect(song.duration).toBeGreaterThan(0);
    expect(mockToolkit.loadDataInput).toContain("<score-partwise");
  });

  it("decodes the base64 MIDI through to parseSmf intact", async () => {
    const song = await parseMusicXml(new TextEncoder().encode(VALID_MXML));
    // The two notes from buildMinimalSmf have velocity 96 and 100.
    expect(song.notes[0].velocity).toBe(96);
    expect(song.notes[1].velocity).toBe(100);
  });

  it("throws a clear error when loadData returns false (malformed XML)", async () => {
    mockToolkit.loadDataReturn = false;
    await expect(parseMusicXml(new TextEncoder().encode("garbage"))).rejects.toThrow(
      /loadData returned false/i,
    );
  });

  it("throws when renderToMIDI returns empty output", async () => {
    mockToolkit.renderReturn = "";
    await expect(parseMusicXml(new TextEncoder().encode(VALID_MXML))).rejects.toThrow(
      /empty MIDI/i,
    );
  });
});

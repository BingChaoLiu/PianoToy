//  canvas  X 

import { FIRST_MIDI, LAST_MIDI, NUM_KEYS, isBlack } from "@/lib/note-utils";

// --- Hit testing: screen coordinate → MIDI note ------------------------------
// Black keys are drawn ON TOP of white keys and are shorter, so we test them
// first. A point that falls within a black key's bounding box returns the
// black key's MIDI; otherwise we map to the white key by X position.

/** Black key width as a fraction of white key width (mirrors drawPiano). */
const BK_W_RATIO = 0.62;
/** Black key height as a fraction of piano height (mirrors drawPiano). */
const BK_H_RATIO = 0.62;

/**
 * Convert a point (relative to the canvas) to a MIDI note, or null if the
 * point is outside the piano region.
 *
 * @param layout  The piano layout from computeLayout.
 * @param x       X relative to the canvas (left edge = 0).
 * @param y       Y relative to the canvas (top edge = 0).
 * @returns       The MIDI note at that point, or null.
 */
export function midiFromPoint(layout: PianoLayout, x: number, y: number): number | null {
  const pianoTop = layout.height - layout.pianoHeight;
  const pianoBottom = layout.height;

  // Outside the piano's vertical bounds.
  if (y < pianoTop || y > pianoBottom) return null;

  const bkW = layout.whiteKeyW * BK_W_RATIO;
  const bkH = layout.pianoHeight * BK_H_RATIO;

  // Test black keys first (they overlap white keys). Only test if the point
  // is within the black-key height region.
  if (y <= pianoTop + bkH) {
    for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
      if (!isBlack(m)) continue;
      const cx = layout.keyX[m - FIRST_MIDI];
      const left = cx - bkW / 2;
      const right = cx + bkW / 2;
      if (x >= left && x <= right) return m;
    }
  }

  // White key: map X to white-key index, then find the MIDI for that index.
  if (x < 0 || x > layout.width) return null;
  const whiteIdx = Math.floor(x / layout.whiteKeyW);
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    if (!isBlack(m) && layout.whiteKeyIndex[m - FIRST_MIDI] === whiteIdx) {
      return m;
    }
  }

  return null;
}

export interface PianoLayout {
  width: number;
  height: number;
  pianoHeight: number;
  whiteKeyW: number;
  /**  midi  X? */
  keyX: number[];
  /**  midi  */
  whiteKeyIndex: number[];
  /**  midi  */
  keyIsWhite: boolean[];
}

export function computeLayout(canvasW: number, canvasH: number): PianoLayout {
  const pianoHeight = Math.max(96, Math.min(160, canvasH * 0.16));
  let numWhite = 0;
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    if (!isBlack(m)) numWhite++;
  }
  const whiteKeyW = canvasW / numWhite;

  const keyX = new Array<number>(NUM_KEYS).fill(0);
  const whiteKeyIndex = new Array<number>(NUM_KEYS).fill(0);
  const keyIsWhite = new Array<boolean>(NUM_KEYS).fill(true);

  let whiteCounter = 0;
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    const black = isBlack(m);
    keyIsWhite[m - FIRST_MIDI] = !black;
    if (!black) {
      keyX[m - FIRST_MIDI] = (whiteCounter + 0.5) * whiteKeyW;
      whiteKeyIndex[m - FIRST_MIDI] = whiteCounter;
      whiteCounter++;
    }
  }
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    if (isBlack(m)) {
      const xPrev = keyX[m - 1 - FIRST_MIDI];
      const xNext = keyX[m + 1 - FIRST_MIDI];
      keyX[m - FIRST_MIDI] = (xPrev + xNext) / 2;
      whiteKeyIndex[m - FIRST_MIDI] = whiteKeyIndex[m - 1 - FIRST_MIDI];
    }
  }

  return {
    width: canvasW,
    height: canvasH,
    pianoHeight,
    whiteKeyW,
    keyX,
    whiteKeyIndex,
    keyIsWhite,
  };
}

//  canvas  X 

import { FIRST_MIDI, LAST_MIDI, NUM_KEYS, isBlack } from "@/lib/note-utils";

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

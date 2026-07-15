// Key-signature staff renderer (T8): draws a single treble staff with a clef
// and the key-signature accidentals for the given NoteKey. Unlike the reading
// renderer (which draws a grand staff + one note), this draws ONLY the clef and
// key signature — the learner's task is to identify which key the accidentals
// represent, not to read a note position.
//
// Reuses the geometry + drawing primitives from reading-staff-renderer (SPACE,
// staff lines, treble clef, accidental positioning). Pure Canvas 2D.

import {
  KEY_SIGNATURE,
  type NoteKey,
} from "@/lib/note-reading-generator";
import { SPACE } from "@/lib/reading-staff-renderer";

const LINE = 1.4;
const INK = "#e8eaf2";

// MIDI -> diatonic staff step (C=0, D=1, ... B=6 per octave).
const NOTE_DEGREE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function midiToStaffStep(midi: number): number {
  const octave = Math.floor(midi / 12) - 1;
  return octave * 7 + NOTE_DEGREE[midi % 12];
}
const TREBLE_BOTTOM_STEP = midiToStaffStep(64); // E4 on bottom line of treble

function staffStepToY(step: number, bottomStep: number, bottomY: number): number {
  return bottomY - (step - bottomStep) * (SPACE / 2);
}

export interface KeySigDrawProps {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  key: NoteKey;
  /** 0..1 fade-in progress of the key signature. */
  fade: number;
  /** Judge flash: "none" | "correct" | "wrong" */
  judge: "none" | "correct" | "wrong";
}

/**
 * Draw a single treble staff with clef + key-signature accidentals. No note —
 * the prompt IS the key signature. The staff is vertically centered in the
 * canvas. A subtle highlight tint appears during a judge flash.
 */
export function drawKeySignatureStaff(props: KeySigDrawProps) {
  const { ctx, width, height, key, fade, judge } = props;

  // Single treble staff, vertically centered.
  const staffHeight = SPACE * 4; // four gaps between five lines
  const topY = Math.max(SPACE * 3, (height - staffHeight) / 2);
  const leftX = SPACE * 1.5;
  const rightX = width - SPACE;

  // Highlight tint during judge flash.
  if (judge !== "none") {
    ctx.save();
    ctx.fillStyle = judge === "correct" ? "#4ade8020" : "#f8717120";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Staff lines.
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const y = Math.round(topY + i * SPACE) + 0.5;
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
  }
  ctx.stroke();

  // Treble clef at the left.
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `${SPACE * 5.4}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const g4Y = topY + SPACE * 3;
  const clefX = leftX + SPACE * 2.5;
  ctx.globalAlpha = fade;
  ctx.fillText("\uD834\uDD1E", clefX, g4Y + SPACE * 0.4);
  ctx.restore();

  // Key signature accidentals.
  const accs = KEY_SIGNATURE[key];
  if (accs.length > 0) {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.font = `${SPACE * 2.8}px "Segoe UI Symbol", "Apple Symbols", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = fade;
    let cursor = clefX + SPACE * 3.5;
    for (const a of accs) {
      const sym = a.kind === "sharp" ? "\u266F" : "\u266D";
      // Position each accidental on its correct staff line/space per its
      // diatonic letter (mirrors reading-staff-renderer's placement).
      const step = a.letter + 5 * 7; // treble octave-5 reference
      const y = staffStepToY(step, TREBLE_BOTTOM_STEP, topY);
      ctx.fillText(sym, cursor, y);
      cursor += SPACE * 1.4;
    }
    ctx.restore();
  }

  // Decorative bar lines at the edges.
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.globalAlpha = fade;
  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.lineTo(leftX, topY + staffHeight);
  ctx.moveTo(rightX, topY);
  ctx.lineTo(rightX, topY + staffHeight);
  ctx.stroke();
  ctx.restore();
}

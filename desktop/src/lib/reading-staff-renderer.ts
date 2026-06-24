// White-background grand staff renderer for the note-reading trainer.
// Draws a static grand staff with fixed clef/key/time at the left, and one
// fading-in black note at the center target indicator. Pure Canvas 2D.

import {
  KEY_SIGNATURE,
  accidentalForNote,
  type NoteKey,
} from "@/lib/note-reading-generator";

// --- Geometry ---
export const SPACE = 13; // gap between two staff lines (core unit)
const LINE = 1.4; // staff line thickness

// MIDI -> diatonic staff step (C=0, D=1, ... B=6 per octave).
const NOTE_DEGREE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function midiToStaffStep(midi: number): number {
  const octave = Math.floor(midi / 12) - 1;
  return octave * 7 + NOTE_DEGREE[midi % 12];
}
const TREBLE_BOTTOM_STEP = midiToStaffStep(64); // E4 on bottom line of treble
const BASS_BOTTOM_STEP = midiToStaffStep(43); // G2 on bottom line of bass

function isTreble(midi: number): boolean {
  return midi >= 60;
}

export interface ReadingStaffLayout {
  trebleTopY: number;
  trebleBottomY: number;
  bassTopY: number;
  bassBottomY: number;
  targetX: number;
}

/** Compute a vertically-centered grand-staff layout for the given canvas size. */
export function computeReadingLayout(canvasW: number, canvasH: number, bottomReserve = 0): ReadingStaffLayout {
  // Center the two staves vertically with a gap between them.
  const staffHeight = SPACE * 4; // four gaps between five lines
  const gap = SPACE * 7; // gap between treble bottom and bass top
  const block = staffHeight * 2 + gap;
  const usableH = canvasH - bottomReserve;
  const startY = Math.max(SPACE * 3, (usableH - block) / 2);

  const trebleTopY = startY;
  const trebleBottomY = startY + staffHeight;
  const bassTopY = trebleBottomY + gap;
  const bassBottomY = bassTopY + staffHeight;
  const targetX = canvasW * 0.5;
  return { trebleTopY, trebleBottomY, bassTopY, bassBottomY, targetX };
}

function staffStepToY(step: number, bottomStep: number, bottomY: number): number {
  return bottomY - (step - bottomStep) * (SPACE / 2);
}

// --- Drawing primitives (black on white) ---

// Ink color for staff symbols/notes: light against the dark canvas.
const INK = "#e8eaf2";

function strokeStaffLines(ctx: CanvasRenderingContext2D, leftX: number, rightX: number, topY: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const y = Math.round(topY + i * SPACE) + 0.5;
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
  }
  ctx.stroke();
}

function drawTrebleClef(ctx: CanvasRenderingContext2D, x: number, topY: number) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `${SPACE * 5.4}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // G clef centered on the G4 line (2nd line from bottom).
  const g4Y = topY + SPACE * 3;
  ctx.fillText("\uD834\uDD1E", x, g4Y + SPACE * 0.4);
  ctx.restore();
}

function drawBassClef(ctx: CanvasRenderingContext2D, x: number, topY: number) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `${SPACE * 4.2}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // F clef sits on the F3 line (2nd line from top of bass staff).
  const f3Y = topY + SPACE;
  ctx.fillText("\uD834\uDD22", x, f3Y + SPACE * 0.2);
  // Two dots straddling the F line.
  ctx.beginPath();
  ctx.arc(x + SPACE * 1.9, f3Y - SPACE * 0.9, SPACE * 0.18, 0, Math.PI * 2);
  ctx.arc(x + SPACE * 1.9, f3Y + SPACE * 0.9, SPACE * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawKeySignature(ctx: CanvasRenderingContext2D, x: number, topY: number, key: NoteKey, kind: "sharp" | "flat") {
  const accs = KEY_SIGNATURE[key].filter((a) => a.kind === kind);
  if (accs.length === 0) return;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `${SPACE * 2.8}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Vertical placement of each accidental per its diatonic letter, in staff steps.
  const letterStep = (letter: number) => letter; // C=0 .. B=6 relative to octave anchor
  // Anchor: place around octave 4/5 for treble. Use staff position relative to top line.
  // Top line of treble = F5. We position by diatonic degree.
  let cursor = x;
  for (const a of accs) {
    const sym = a.kind === "sharp" ? "\u266F" : "\u266D";
    // Map letter to a Y within the staff for display (treble reference).
    const step = letterStep(a.letter) + 5 * 7; // around octave 5
    const y = staffStepToY(step, TREBLE_BOTTOM_STEP, topY);
    ctx.fillText(sym, cursor, y);
    cursor += SPACE * 1.1;
  }
  ctx.restore();
}

function drawTimeSignature(ctx: CanvasRenderingContext2D, x: number, topY: number) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `bold ${SPACE * 3.2}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("4", x, topY + SPACE * 1.5);
  ctx.fillText("4", x, topY + SPACE * 3.5);
  ctx.restore();
}

function drawLedgerLines(ctx: CanvasRenderingContext2D, x: number, y: number, staffTopY: number, staffBottomY: number) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  const len = SPACE * 1.25;
  // Above the staff
  if (y < staffTopY - SPACE * 0.4) {
    let ly = staffTopY - SPACE;
    while (ly >= y - SPACE * 0.5) {
      ctx.beginPath();
      ctx.moveTo(x - len, Math.round(ly) + 0.5);
      ctx.lineTo(x + len, Math.round(ly) + 0.5);
      ctx.stroke();
      ly -= SPACE;
    }
  }
  // Below the staff
  if (y > staffBottomY + SPACE * 0.4) {
    let ly = staffBottomY + SPACE;
    while (ly <= y + SPACE * 0.5) {
      ctx.beginPath();
      ctx.moveTo(x - len, Math.round(ly) + 0.5);
      ctx.lineTo(x + len, Math.round(ly) + 0.5);
      ctx.stroke();
      ly += SPACE;
    }
  }
  // Middle C ledger line (between the staves)
  if (y > staffBottomY + SPACE * 0.4 && y < staffTopY) {
    // handled above
  }
  ctx.restore();
}

function drawAccidental(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "sharp" | "flat" | "natural") {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `${SPACE * 3}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const sym = kind === "sharp" ? "\u266F" : kind === "flat" ? "\u266D" : "\u266E";
  ctx.fillText(sym, x, y);
  ctx.restore();
}

export interface ReadingDrawProps {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Pixels reserved at the bottom (e.g. for the piano keyboard). White panel ends here. */
  bottomReserve?: number;
  key: NoteKey;
  note: number | null;
  /** 0..1 fade-in progress of the current note. */
  fade: number;
  /** Judge flash: "none" | "correct" | "wrong" */
  judge: "none" | "correct" | "wrong";
}

export function drawReadingStaff(props: ReadingDrawProps) {
  const { ctx, width, height, key, note, fade, judge } = props;
  const bottomReserve = props.bottomReserve ?? 0;
  const L = computeReadingLayout(width, height, bottomReserve);

  const leftX = SPACE * 1.5;

  // Staff lines.
  strokeStaffLines(ctx, leftX, width - SPACE, L.trebleTopY);
  strokeStaffLines(ctx, leftX, width - SPACE, L.bassTopY);

  // Connecting brace on the left.
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE * 1.3;
  ctx.beginPath();
  ctx.moveTo(leftX, L.trebleTopY);
  ctx.lineTo(leftX, L.bassBottomY);
  ctx.stroke();

  // Fixed symbols region (clef / key / time) at the left.
  const clefX = leftX + SPACE * 1.8;
  drawTrebleClef(ctx, clefX, L.trebleTopY);
  drawBassClef(ctx, clefX, L.bassTopY);

  let ksX = clefX + SPACE * 2.6;
  drawKeySignature(ctx, ksX, L.trebleTopY, key, "sharp");
  drawKeySignature(ctx, ksX, L.trebleTopY, key, "flat");
  // Approximate advance for the time signature position.
  ksX += Math.max(KEY_SIGNATURE[key].length * SPACE * 1.1, SPACE);
  const tsX = ksX + SPACE * 0.5;
  drawTimeSignature(ctx, tsX, L.trebleTopY);
  drawTimeSignature(ctx, tsX, L.bassTopY);

  // Vertical bar line closing the fixed region.
  const fixedBarX = tsX + SPACE * 1.4;
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  ctx.moveTo(fixedBarX, L.trebleTopY);
  ctx.lineTo(fixedBarX, L.bassBottomY);
  ctx.stroke();

  // Target indicator: a thin vertical guide line at the target position.
  ctx.save();
  ctx.strokeStyle = judge === "correct" ? "#4ade80" : judge === "wrong" ? "#f87171" : "#6b7280";
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(L.targetX, L.trebleTopY - SPACE);
  ctx.lineTo(L.targetX, L.bassBottomY + SPACE);
  ctx.stroke();
  ctx.restore();

  if (note == null || fade <= 0.001) return;

  // Draw the single prompt note.
  const treble = isTreble(note);
  const step = midiToStaffStep(note);
  const bottomStep = treble ? TREBLE_BOTTOM_STEP : BASS_BOTTOM_STEP;
  const bottomY = treble ? L.trebleBottomY : L.bassBottomY;
  const staffTopY = treble ? L.trebleTopY : L.bassTopY;
  const noteY = staffStepToY(step, bottomStep, bottomY);
  const noteX = L.targetX;

  ctx.save();
  ctx.globalAlpha = fade;

  // Ledger lines for out-of-staff notes.
  drawLedgerLines(ctx, noteX, noteY, staffTopY, bottomY);

  // Accidental if needed beyond the key signature.
  const acc = accidentalForNote(note, key);
  if (acc === "sharp" || acc === "flat" || acc === "natural") {
    drawAccidental(ctx, noteX - SPACE * 1.8, noteY, acc);
  }

  // Note head: filled ellipse (quarter note style), slightly slanted.
  const headColor = judge === "correct" ? "#4ade80" : judge === "wrong" ? "#f87171" : INK;
  ctx.fillStyle = headColor;
  ctx.beginPath();
  ctx.ellipse(noteX, noteY, SPACE * 0.62, SPACE * 0.46, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Stem: direction depends on vertical position relative to the staff middle.
  const midStep = (midiToStaffStep(treble ? 71 : 50) + midiToStaffStep(treble ? 64 : 43)) / 2;
  const stemUp = step < midStep;
  const stemLen = SPACE * 3.4;
  const stemX = stemUp ? noteX + SPACE * 0.5 : noteX - SPACE * 0.5;
  ctx.strokeStyle = headColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(stemX, noteY);
  ctx.lineTo(stemX, stemUp ? noteY - stemLen : noteY + stemLen);
  ctx.stroke();

  ctx.restore();
}

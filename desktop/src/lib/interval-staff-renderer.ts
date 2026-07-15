// Interval staff renderer (T9): draws a single treble staff with two notes
// representing an interval. Harmonic intervals are drawn as stacked noteheads
// (same X, stems joined); melodic intervals are drawn sequentially (different
// X positions, separate stems).
//
// Reuses geometry constants from reading-staff-renderer (SPACE). Pure Canvas 2D.

import type { IntervalInstance } from "@/lib/interval-generator";
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

export interface IntervalDrawProps {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** The interval instance to render (two pitches + harmonic/melodic). */
  instance: IntervalInstance | null;
  /** 0..1 fade-in progress of the notes. */
  fade: number;
  /** Judge flash: "none" | "correct" | "wrong" */
  judge: "none" | "correct" | "wrong";
}

/**
 * Draw a single treble staff with an interval (two notes). The staff is
 * vertically centered. Harmonic intervals stack the noteheads at center X with
 * joined stems; melodic intervals place them at 35%/65% width with separate
 * stems.
 */
export function drawIntervalStaff(props: IntervalDrawProps) {
  const { ctx, width, height, instance, fade, judge } = props;

  // Single treble staff, vertically centered.
  const staffHeight = SPACE * 4;
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
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const y = Math.round(topY + i * SPACE) + 0.5;
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
  }
  ctx.stroke();
  ctx.restore();

  if (!instance || fade <= 0.001) {
    // Just the clef + staff lines when no instance.
    drawTrebleClef(ctx, leftX + SPACE * 2.5, topY, fade);
    drawBarLines(ctx, leftX, rightX, topY, staffHeight);
    return;
  }

  // Treble clef.
  drawTrebleClef(ctx, leftX + SPACE * 2.5, topY, fade);

  const headColor = judge === "correct" ? "#4ade80" : judge === "wrong" ? "#f87171" : INK;
  const { lowPitch, highPitch, harmonic } = instance;
  const lowStep = midiToStaffStep(lowPitch);
  const highStep = midiToStaffStep(highPitch);
  const bottomY = topY + staffHeight;
  const lowY = staffStepToY(lowStep, TREBLE_BOTTOM_STEP, bottomY);
  const highY = staffStepToY(highStep, TREBLE_BOTTOM_STEP, bottomY);

  ctx.save();
  ctx.globalAlpha = fade;

  if (harmonic) {
    // Stacked: both noteheads at center X with a single joined stem that
    // connects them and extends past the outer notehead.
    const x = width * 0.5;
    drawLedgerLines(ctx, x, lowY, topY, bottomY);
    drawLedgerLines(ctx, x, highY, topY, bottomY);
    drawNoteHead(ctx, x, lowY, headColor);
    drawNoteHead(ctx, x, highY, headColor);
    // Stem direction: up if the average pitch is below the staff middle
    // (standard notation rule for two-note chords).
    const staffMidY = topY + staffHeight / 2;
    const avgY = (lowY + highY) / 2;
    const stemUp = avgY > staffMidY; // below middle → stem up
    const stemLen = SPACE * 3.4;
    const stemX = stemUp ? x + SPACE * 0.5 : x - SPACE * 0.5;
    // Stem runs from the bottom note to above the top note (stem up), or
    // from the top note to below the bottom note (stem down).
    ctx.strokeStyle = headColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (stemUp) {
      ctx.moveTo(stemX, lowY);
      ctx.lineTo(stemX, highY - stemLen);
    } else {
      ctx.moveTo(stemX, highY);
      ctx.lineTo(stemX, lowY + stemLen);
    }
    ctx.stroke();
  } else {
    // Sequential: noteheads at different X positions, separate stems.
    const xLow = width * 0.35;
    const xHigh = width * 0.65;
    drawLedgerLines(ctx, xLow, lowY, topY, bottomY);
    drawLedgerLines(ctx, xHigh, highY, topY, bottomY);
    drawNoteHead(ctx, xLow, lowY, headColor);
    drawNoteHead(ctx, xHigh, highY, headColor);
    // Each note gets its own stem (quarter-note style).
    drawStem(ctx, xLow, lowY, lowStep, headColor);
    drawStem(ctx, xHigh, highY, highStep, headColor);
  }

  ctx.restore();

  drawBarLines(ctx, leftX, rightX, topY, staffHeight);
}

// --- Drawing primitives ------------------------------------------------------

function drawTrebleClef(ctx: CanvasRenderingContext2D, x: number, topY: number, fade: number) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = `${SPACE * 5.4}px "Segoe UI Symbol", "Apple Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = fade;
  const g4Y = topY + SPACE * 3;
  ctx.fillText("\uD834\uDD1E", x, g4Y + SPACE * 0.4);
  ctx.restore();
}

function drawBarLines(ctx: CanvasRenderingContext2D, leftX: number, rightX: number, topY: number, staffHeight: number) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.lineTo(leftX, topY + staffHeight);
  ctx.moveTo(rightX, topY);
  ctx.lineTo(rightX, topY + staffHeight);
  ctx.stroke();
  ctx.restore();
}

function drawNoteHead(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, SPACE * 0.62, SPACE * 0.46, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStem(ctx: CanvasRenderingContext2D, x: number, y: number, step: number, color: string) {
  // Stem direction: up if below the staff midpoint, down if above.
  const midStep = midiToStaffStep(71) + midiToStaffStep(64) / 2; // ~B4/E4 midpoint
  const stemUp = step < midStep;
  const stemLen = SPACE * 3.4;
  const stemX = stemUp ? x + SPACE * 0.5 : x - SPACE * 0.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(stemX, y);
  ctx.lineTo(stemX, stemUp ? y - stemLen : y + stemLen);
  ctx.stroke();
  ctx.restore();
}

function drawLedgerLines(ctx: CanvasRenderingContext2D, x: number, y: number, staffTopY: number, staffBottomY: number) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  const len = SPACE * 1.25;
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
  ctx.restore();
}

// Staff notation renderer: draws a grand staff with notes scrolling horizontally.
// Professional Canvas 2D rendering, no external dependencies.

import type { Song } from "@/types/midi";
import type { PianoLayout } from "@/lib/piano-layout";

// --- Staff geometry ---
const STAFF_SPACE = 7;
const LINE_GAP = STAFF_SPACE;

// MIDI note -> diatonic staff step
const NOTE_DEGREE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function midiToStaffStep(midi: number): number {
  const octave = Math.floor(midi / 12) - 1;
  const degree = NOTE_DEGREE[midi % 12];
  return octave * 7 + degree;
}

const TREBLE_BOTTOM_STEP = midiToStaffStep(64);
const BASS_BOTTOM_STEP = midiToStaffStep(43);

interface StaffLayout {
  trebleTopY: number;
  trebleBottomY: number;
  bassTopY: number;
  bassBottomY: number;
  staffAreaTop: number;
  staffAreaBottom: number;
}

function computeStaffLayout(pianoTop: number): StaffLayout {
  const staffAreaTop = 8;
  const staffAreaBottom = pianoTop - 8;
  const totalHeight = staffAreaBottom - staffAreaTop;
  // Split: treble gets 45%, gap 10%, bass gets 45%
  const trebleSpace = totalHeight * 0.42;

  const trebleBottomY = staffAreaTop + trebleSpace;
  const trebleTopY = trebleBottomY - LINE_GAP * 4;
  const bassBottomY = staffAreaBottom;
  const bassTopY = bassBottomY - LINE_GAP * 4;

  return { trebleTopY, trebleBottomY, bassTopY, bassBottomY, staffAreaTop, staffAreaBottom };
}

function staffStepToY(step: number, bottomStep: number, bottomY: number): number {
  return bottomY - (step - bottomStep) * (LINE_GAP / 2);
}

function isTreble(midi: number): boolean { return midi >= 60; }

type NoteDurationType = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "short";

function classifyDuration(durationSec: number, beatSec: number): NoteDurationType {
  const beats = durationSec / beatSec;
  if (beats >= 3.5) return "whole";
  if (beats >= 1.5) return "half";
  if (beats >= 0.75) return "quarter";
  if (beats >= 0.375) return "eighth";
  if (beats >= 0.1875) return "sixteenth";
  return "short";
}

// --- Drawing primitives ---

function drawStaffLines(ctx: CanvasRenderingContext2D, leftX: number, rightX: number, topY: number) {
  ctx.strokeStyle = "rgba(200,200,215,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const y = topY + i * LINE_GAP;
    ctx.moveTo(leftX, Math.round(y) + 0.5);
    ctx.lineTo(rightX, Math.round(y) + 0.5);
  }
  ctx.stroke();
  // Left edge thick line
  ctx.strokeStyle = "rgba(200,200,215,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftX, topY);
  ctx.lineTo(leftX, topY + LINE_GAP * 4);
  ctx.stroke();
}

// Draw treble clef using Unicode music symbol (font-based, reliable)
function drawTrebleClef(ctx: CanvasRenderingContext2D, x: number, centerY: number) {
  ctx.save();
  ctx.fillStyle = "rgba(220,220,235,0.85)";
  ctx.font = `${STAFF_SPACE * 5}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\uD834\uDD1E", x, centerY + STAFF_SPACE * 0.5);
  ctx.restore();
}

// Draw bass clef using Unicode music symbol
function drawBassClef(ctx: CanvasRenderingContext2D, x: number, centerY: number) {
  ctx.save();
  ctx.fillStyle = "rgba(220,220,235,0.85)";
  ctx.font = `${STAFF_SPACE * 3.5}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\uD834\uDD22", x, centerY);
  // Two dots
  ctx.fillStyle = "rgba(220,220,235,0.85)";
  ctx.beginPath();
  ctx.arc(x + STAFF_SPACE * 1.8, centerY - STAFF_SPACE * 1, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + STAFF_SPACE * 1.8, centerY + STAFF_SPACE * 1, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw time signature numbers
function drawTimeSignature(ctx: CanvasRenderingContext2D, x: number, topY: number, beatsPerBar: number, beatUnit: number) {
  ctx.save();
  ctx.fillStyle = "rgba(220,220,235,0.8)";
  ctx.font = `bold ${STAFF_SPACE * 2.8}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(beatsPerBar), x, topY + STAFF_SPACE * 1.5);
  ctx.fillText(String(beatUnit), x, topY + STAFF_SPACE * 3.5);
  ctx.restore();
}

// Draw note head with proper shape
function drawNoteHead(ctx: CanvasRenderingContext2D, x: number, y: number, type: NoteDurationType, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const rx = STAFF_SPACE * 0.6;
  const ry = STAFF_SPACE * 0.45;

  if (type === "whole") {
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.1, ry, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === "half") {
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Draw stem
function drawStem(ctx: CanvasRenderingContext2D, x: number, y: number, stemUp: boolean, stemLen: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  const stemX = stemUp ? x + STAFF_SPACE * 0.5 : x - STAFF_SPACE * 0.5;
  ctx.moveTo(stemX, y);
  ctx.lineTo(stemX, stemUp ? y - stemLen : y + stemLen);
  ctx.stroke();
  ctx.restore();
  return stemX;
}

// Draw flags for eighth/sixteenth notes
function drawFlag(ctx: CanvasRenderingContext2D, stemX: number, stemEndY: number, stemUp: boolean, flags: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < flags; i++) {
    const fy = stemEndY + (stemUp ? i * STAFF_SPACE * 0.9 : -i * STAFF_SPACE * 0.9);
    ctx.beginPath();
    if (stemUp) {
      ctx.moveTo(stemX, fy);
      ctx.quadraticCurveTo(stemX + STAFF_SPACE * 1.6, fy + STAFF_SPACE * 0.6, stemX + STAFF_SPACE * 1.2, fy + STAFF_SPACE * 1.8);
      ctx.quadraticCurveTo(stemX + STAFF_SPACE * 0.7, fy + STAFF_SPACE * 1.0, stemX, fy + STAFF_SPACE * 1.2);
    } else {
      ctx.moveTo(stemX, fy);
      ctx.quadraticCurveTo(stemX + STAFF_SPACE * 1.6, fy - STAFF_SPACE * 0.6, stemX + STAFF_SPACE * 1.2, fy - STAFF_SPACE * 1.8);
      ctx.quadraticCurveTo(stemX + STAFF_SPACE * 0.7, fy - STAFF_SPACE * 1.0, stemX, fy - STAFF_SPACE * 1.2);
    }
    ctx.fill();
  }
  ctx.restore();
}

// Draw ledger lines
function drawLedgerLines(ctx: CanvasRenderingContext2D, x: number, y: number, staffTopY: number, staffBottomY: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(200,200,215,0.35)";
  ctx.lineWidth = 1;
  const ledgerLen = STAFF_SPACE * 1.2;

  if (y < staffTopY - LINE_GAP * 0.4) {
    let ly = staffTopY - LINE_GAP;
    while (ly >= y - LINE_GAP * 0.5) {
      ctx.beginPath();
      ctx.moveTo(x - ledgerLen, Math.round(ly) + 0.5);
      ctx.lineTo(x + ledgerLen, Math.round(ly) + 0.5);
      ctx.stroke();
      ly -= LINE_GAP;
    }
  }
  if (y > staffBottomY + LINE_GAP * 0.4) {
    let ly = staffBottomY + LINE_GAP;
    while (ly <= y + LINE_GAP * 0.5) {
      ctx.beginPath();
      ctx.moveTo(x - ledgerLen, Math.round(ly) + 0.5);
      ctx.lineTo(x + ledgerLen, Math.round(ly) + 0.5);
      ctx.stroke();
      ly += LINE_GAP;
    }
  }
  ctx.restore();
}

// --- Main export ---
export interface StaffDrawProps {
  ctx: CanvasRenderingContext2D;
  layout: PianoLayout;
  pianoTop: number;
  song: Song | null;
  songT: number;
  practice: boolean;
  bpm: number;
}

export function drawStaffView(props: StaffDrawProps) {
  const { ctx, layout, pianoTop, song, songT, practice, bpm } = props;
  if (!song) return;

  const sl = computeStaffLayout(pianoTop);
  const beatSec = 60 / bpm;
  const pxPerBeat = 55;
  const pxPerSec = pxPerBeat / beatSec;
  const playheadX = layout.width * 0.25;
  const clefX = 30;
  const leftX = 55;
  const rightX = layout.width;
  const beatsPerBar = 4;
  const beatUnit = 4;

  // Background panel
  const panelGrad = ctx.createLinearGradient(0, sl.staffAreaTop, 0, sl.staffAreaBottom);
  panelGrad.addColorStop(0, "rgba(20,22,30,0.6)");
  panelGrad.addColorStop(1, "rgba(15,17,25,0.4)");
  ctx.fillStyle = panelGrad;
  ctx.fillRect(0, sl.staffAreaTop, layout.width, sl.staffAreaBottom - sl.staffAreaTop);

  // Staff lines
  drawStaffLines(ctx, leftX, rightX, sl.trebleTopY);
  drawStaffLines(ctx, leftX, rightX, sl.bassTopY);

  // Brace connecting staves
  ctx.strokeStyle = "rgba(200,200,215,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftX, sl.trebleTopY);
  ctx.lineTo(leftX, sl.bassBottomY);
  ctx.stroke();

  // Clefs
  drawTrebleClef(ctx, clefX, (sl.trebleTopY + sl.trebleBottomY) / 2);
  drawBassClef(ctx, clefX, (sl.bassTopY + sl.bassBottomY) / 2);

  // Time signature
  drawTimeSignature(ctx, clefX + STAFF_SPACE * 2.5, sl.trebleTopY, beatsPerBar, beatUnit);
  drawTimeSignature(ctx, clefX + STAFF_SPACE * 2.5, sl.bassTopY, beatsPerBar, beatUnit);

  // Bar lines
  const barSec = beatsPerBar * beatSec;
  const firstBarVisible = Math.floor((songT - (playheadX / pxPerSec)) / barSec) * barSec;
  const lastBarVisible = songT + ((rightX - playheadX) / pxPerSec);
  for (let barT = firstBarVisible; barT <= lastBarVisible; barT += barSec) {
    const barX = playheadX + (barT - songT) * pxPerSec;
    if (barX < leftX || barX > rightX) continue;
    ctx.strokeStyle = "rgba(200,200,215,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barX, sl.trebleTopY);
    ctx.lineTo(barX, sl.trebleBottomY);
    ctx.moveTo(barX, sl.bassTopY);
    ctx.lineTo(barX, sl.bassBottomY);
    ctx.stroke();
  }

  // Playhead
  const phGrad = ctx.createLinearGradient(playheadX - 3, 0, playheadX + 3, 0);
  phGrad.addColorStop(0, "rgba(100,200,255,0)");
  phGrad.addColorStop(0.5, "rgba(100,200,255,0.5)");
  phGrad.addColorStop(1, "rgba(100,200,255,0)");
  ctx.fillStyle = phGrad;
  ctx.fillRect(playheadX - 3, sl.staffAreaTop, 6, sl.staffAreaBottom - sl.staffAreaTop);
  ctx.strokeStyle = "rgba(100,200,255,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(playheadX, sl.staffAreaTop);
  ctx.lineTo(playheadX, sl.staffAreaBottom);
  ctx.stroke();

  // Notes
  const visibleStartT = songT - (playheadX / pxPerSec);
  const visibleEndT = songT + ((rightX - playheadX) / pxPerSec);

  for (const ev of song.notes) {
    if (ev.start + ev.duration < visibleStartT || ev.start > visibleEndT) continue;
    const noteX = playheadX + (ev.start - songT) * pxPerSec;
    if (noteX < leftX - 20 || noteX > rightX + 20) continue;

    const treble = isTreble(ev.midi);
    const step = midiToStaffStep(ev.midi);
    const bottomStep = treble ? TREBLE_BOTTOM_STEP : BASS_BOTTOM_STEP;
    const bottomY = treble ? sl.trebleBottomY : sl.bassBottomY;
    const staffTopY = treble ? sl.trebleTopY : sl.bassTopY;
    const noteY = staffStepToY(step, bottomStep, bottomY);

    const durType = classifyDuration(ev.duration, beatSec);
    const isNow = ev.start <= songT && songT < ev.start + ev.duration;
    const isPast = ev.start + ev.duration < songT;

    let color = "rgba(230,230,240,0.92)";
    if (isPast) {
      color = practice && ev._missed
        ? "rgba(239,68,68,0.45)"
        : practice && ev._matched
        ? "rgba(74,222,128,0.45)"
        : "rgba(130,130,145,0.35)";
    } else if (isNow) {
      color = "rgba(110,200,255,1.0)";
    }

    drawLedgerLines(ctx, noteX, noteY, staffTopY, bottomY);

    if (isNow) {
      ctx.shadowColor = "rgba(100,200,255,0.5)";
      ctx.shadowBlur = 10;
    }
    drawNoteHead(ctx, noteX, noteY, durType, color);
    ctx.shadowBlur = 0;

    if (durType !== "whole") {
      const trebleMidStep = (midiToStaffStep(64) + midiToStaffStep(71)) / 2;
      const bassMidStep = (midiToStaffStep(38) + midiToStaffStep(45)) / 2;
      const midStep = treble ? trebleMidStep : bassMidStep;
      const stemUp = step < midStep;
      const stemLen = STAFF_SPACE * 3.5;
      const stemX = drawStem(ctx, noteX, noteY, stemUp, stemLen, color);

      if (durType === "eighth") {
        const stemEndY = stemUp ? noteY - stemLen : noteY + stemLen;
        drawFlag(ctx, stemX, stemEndY, stemUp, 1, color);
      } else if (durType === "sixteenth") {
        const stemEndY = stemUp ? noteY - stemLen : noteY + stemLen;
        drawFlag(ctx, stemX, stemEndY, stemUp, 2, color);
      }
    }
  }
}

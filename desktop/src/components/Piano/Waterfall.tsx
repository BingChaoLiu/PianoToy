//  +  C  +  + live history trails?
//  web ? L1494-1637 

import { FIRST_MIDI, MIDDLE_C, isBlack, noteName, roundRect } from "@/lib/note-utils";
import type { PianoLayout } from "@/lib/piano-layout";
import { colorForSongNote, glowForSongNote, colorForMidi, glowForMidi } from "@/lib/color";
import type { ColorMode } from "@/store/useSettingsStore";
import type { Song } from "@/types/midi";
import type { HistoryEntry } from "@/store/useInputStore";

interface SongDrawProps {
  ctx: CanvasRenderingContext2D;
  layout: PianoLayout;
  pianoTop: number;
  waterBottom: number;
  /**  */
  pxPerSec: number;
  song: Song | null;
  songT: number;
  practice: boolean;
  colorMode: ColorMode;
  showLabels: boolean;
}

export function drawSong(p: SongDrawProps) {
  const { ctx, layout, pianoTop, waterBottom, pxPerSec, song, songT, practice, colorMode, showLabels } = p;
  if (!song) return;
  const { keyX, whiteKeyW } = layout;

  for (const ev of song.notes) {
    const noteStart = ev.start;
    const noteEnd = ev.start + ev.duration;
    // screenTop ? noteEndscreenBottom ? noteStart
    const screenTop = waterBottom - (noteEnd - songT) * pxPerSec;
    const screenBottom = waterBottom - (noteStart - songT) * pxPerSec;
    if (screenBottom < 0 || screenTop > waterBottom + 20) continue;

    const x = keyX[ev.midi - FIRST_MIDI];
    const black = isBlack(ev.midi);
    const w = black ? whiteKeyW * 0.62 : whiteKeyW * 0.86;
    const rectTop = Math.max(0, screenTop);
    const rectBottom = Math.min(waterBottom, screenBottom);
    const rectH = rectBottom - rectTop;
    if (rectH <= 0) continue;

    const isNow = noteStart <= songT && songT < noteEnd;
    const fillColor = colorForSongNote(
      ev,
      { practice, matched: !!ev._matched, missed: !!ev._missed, isNow },
      colorMode,
    );
    const glowColor = (isNow || (practice && ev._matched))
      ? glowForSongNote(ev, { practice, matched: !!ev._matched, missed: !!ev._missed, isNow }, colorMode)
      : null;

    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 16;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = fillColor;
    roundRect(ctx, x - w / 2, rectTop, w, rectH, Math.min(5, w / 2));
    ctx.fill();
    ctx.shadowBlur = 0;

    // practice  timing label
    if (practice && ev._matched && ev._deltaTime != null && rectH > 18) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const ms = Math.round(ev._deltaTime * 1000);
      const sign = ms >= 0 ? "+" : "";
      ctx.fillText(sign + ms + "ms", x, rectTop + 8);
    }

    // 
    if (w > 6 && rectH > 4) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      roundRect(ctx, x - w / 2 + 1.5, rectTop + 1.5, w - 3, Math.min(3, rectH - 3), 2);
      ctx.fill();
    }
    if (showLabels && rectH > 22) {
      ctx.fillStyle = isNow ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.55)";
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(noteName(ev.midi), x, rectBottom - 10);
    }
  }
  // pianoTop  PianoKeyboard 
  void pianoTop;
}

interface GridDrawProps {
  ctx: CanvasRenderingContext2D;
  layout: PianoLayout;
  waterBottom: number;
}

export function drawGrid(p: GridDrawProps) {
  const { ctx, layout, waterBottom } = p;
  ctx.save();
  for (let m = FIRST_MIDI; m <= FIRST_MIDI + 88 - 1; m++) {
    if (m % 12 === 0 && !isBlack(m)) {
      const x = layout.keyX[m - FIRST_MIDI];
      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - layout.whiteKeyW / 2, 0);
      ctx.lineTo(x - layout.whiteKeyW / 2, waterBottom);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(noteName(m), x - layout.whiteKeyW / 2 + 4, 4);
    }
  }
  //  C 
  const mcX = layout.keyX[MIDDLE_C - FIRST_MIDI];
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(mcX, 0);
  ctx.lineTo(mcX, waterBottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

interface HistoryDrawProps {
  ctx: CanvasRenderingContext2D;
  layout: PianoLayout;
  waterBottom: number;
  pxPerSec: number;
  now: number;  // performance.now()/1000
  history: HistoryEntry[];
  colorMode: ColorMode;
  showLabels: boolean;
  /** practice  history */
  practice: boolean;
}

export function drawHistory(p: HistoryDrawProps) {
  const { ctx, layout, waterBottom, pxPerSec, now, history, colorMode, showLabels, practice } = p;
  if (practice) return; // practice  live trail
  const { keyX, whiteKeyW } = layout;
  ctx.save();
  for (const ev of history) {
    const x = keyX[ev.midi - FIRST_MIDI];
    const black = isBlack(ev.midi);
    const w = black ? whiteKeyW * 0.62 : whiteKeyW * 0.86;
    const noteHeight = 10;
    const startY = waterBottom - (now - ev.start) * pxPerSec;
    const endT = ev.end == null ? now : ev.end;
    const endY = waterBottom - (now - endT) * pxPerSec;
    const rectTop = startY;
    const rectHeight = Math.max(noteHeight, endY - startY);
    if (endY < 0) continue;

    if (ev.end === null) {
      ctx.shadowColor = glowForMidi(ev.midi);
      ctx.shadowBlur = 18;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = colorForMidi(ev.midi, ev.velocity, colorMode);
    roundRect(ctx, x - w / 2, rectTop, w, rectHeight, Math.min(5, w / 2));
    ctx.fill();
    ctx.shadowBlur = 0;

    if (w > 6 && rectHeight > 6) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(ctx, x - w / 2 + 1.5, rectTop + 1.5, w - 3, Math.min(3, rectHeight - 3), 2);
      ctx.fill();
    }
    if (showLabels && rectHeight > 22) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labelY = Math.max(rectTop + 10, endY - 8);
      ctx.fillText(noteName(ev.midi), x, labelY);
    }
  }
  ctx.restore();
}

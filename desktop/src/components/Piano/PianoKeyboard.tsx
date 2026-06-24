// 88  web ? L1645-1730 

import { memo } from "react";
import {
  FIRST_MIDI, LAST_MIDI, MIDDLE_C, isBlack, noteName, roundRect, shade,
} from "@/lib/note-utils";
import type { PianoLayout } from "@/lib/piano-layout";
import { pianoKeyActiveColor, pianoKeySongColor } from "@/lib/color";
import type { ActiveNote } from "@/store/useInputStore";
import type { ColorMode } from "@/store/useSettingsStore";

interface SongSoundingNote {
  midi: number;
  track?: number;
}

interface Props {
  ctx: CanvasRenderingContext2D;
  layout: PianoLayout;
  pianoTop: number;
  active: Map<number, ActiveNote>;
  wrongFlash: Map<number, number>;
  songSounding: Map<number, SongSoundingNote>;
  colorMode: ColorMode;
  showLabels: boolean;
}

function drawPianoImpl({
  ctx, layout, pianoTop, active, wrongFlash, songSounding, colorMode, showLabels,
}: Props) {
  const { pianoHeight: pianoH, whiteKeyW: wk, keyX, whiteKeyIndex } = layout;

  // ----  ----
  ctx.save();
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    if (isBlack(m)) continue;
    const i = whiteKeyIndex[m - FIRST_MIDI];
    const x = i * wk;
    const isActive = active.has(m);
    const activeNote = active.get(m);
    const songNote = songSounding.get(m);
    const wrong = wrongFlash.has(m) || activeNote?.matchResult === "wrong";
    const correct = activeNote?.matchResult === "hit";
    const grad = ctx.createLinearGradient(0, pianoTop, 0, pianoTop + pianoH);
    if (wrong) {
      grad.addColorStop(0, "#ff5555");
      grad.addColorStop(1, "#aa1f1f");
    } else if (correct) {
      grad.addColorStop(0, "#4ade80");
      grad.addColorStop(1, "#16a34a");
    } else if (isActive) {
      const c = pianoKeyActiveColor(m, colorMode);
      grad.addColorStop(0, c);
      grad.addColorStop(1, shade(c, -25));
    } else if (songNote) {
      const c = pianoKeySongColor({ midi: m, track: songNote.track }, colorMode);
      grad.addColorStop(0, c);
      grad.addColorStop(1, shade(c, -30));
    } else {
      grad.addColorStop(0, "#f4f4f7");
      grad.addColorStop(1, "#c8cad3");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, pianoTop, wk - 1, pianoH);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, pianoTop + 0.5, wk - 1, pianoH - 1);
    if (showLabels && (m % 12 === 0 || isActive || songNote)) {
      ctx.fillStyle = isActive || songNote ? "#1a1d2a" : "#8a8f9c";
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(noteName(m), x + wk / 2, pianoTop + pianoH - 4);
    }
  }
  ctx.restore();

  // ----  ----
  ctx.save();
  const bkW = wk * 0.62;
  const bkH = pianoH * 0.62;
  for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
    if (!isBlack(m)) continue;
    const x = keyX[m - FIRST_MIDI] - bkW / 2;
    const isActive = active.has(m);
    const activeNote = active.get(m);
    const songNote = songSounding.get(m);
    const wrong = wrongFlash.has(m) || activeNote?.matchResult === "wrong";
    const correct = activeNote?.matchResult === "hit";
    const grad = ctx.createLinearGradient(0, pianoTop, 0, pianoTop + bkH);
    if (wrong) {
      grad.addColorStop(0, "#ff7a7a");
      grad.addColorStop(1, "#a02020");
    } else if (correct) {
      grad.addColorStop(0, "#6ee7b7");
      grad.addColorStop(1, "#047857");
    } else if (isActive) {
      const c = pianoKeyActiveColor(m, colorMode);
      grad.addColorStop(0, shade(c, 15));
      grad.addColorStop(1, c);
    } else if (songNote) {
      const c = pianoKeySongColor({ midi: m, track: songNote.track }, colorMode);
      grad.addColorStop(0, c);
      grad.addColorStop(1, shade(c, -25));
    } else {
      grad.addColorStop(0, "#2c3040");
      grad.addColorStop(1, "#13151d");
    }
    ctx.fillStyle = grad;
    roundRect(ctx, x, pianoTop, bkW, bkH, 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x, pianoTop + bkH - 3, bkW, 3);
  }
  ctx.restore();

  //  1 
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(0, pianoTop, layout.width, 1);
  //  C 
  const mcX = keyX[MIDDLE_C - FIRST_MIDI];
  ctx.strokeStyle = "rgba(245,185,66,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mcX, pianoTop);
  ctx.lineTo(mcX, pianoTop + pianoH);
  ctx.stroke();
}

/**  DOM? */
export const PianoKeyboard = memo(function PianoKeyboard(_props: Props) {
  //  Stage.tsx ? RAF  drawPiano(...) 
  return null;
});

export { drawPianoImpl as drawPiano };

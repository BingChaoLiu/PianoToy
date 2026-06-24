// Note Reading stage: a dark staff panel that fades in one note at a time.
// The user identifies each note on the keyboard/MIDI. Correct advances to the
// next note; wrong keeps the note for retry. Piano renders at the bottom.

import { useEffect, useRef } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNoteReadingStore } from "@/store/useNoteReadingStore";
import { useInputStore } from "@/store/useInputStore";
import { drawReadingStaff } from "@/lib/reading-staff-renderer";
import { drawPiano } from "@/components/Piano/PianoKeyboard";
import { computeLayout, type PianoLayout } from "@/lib/piano-layout";
import {
  keysForDifficulty,
  KEY_LABELS,
  type NoteKey,
  type ReadingDifficulty,
} from "@/lib/note-reading-generator";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/useSettingsStore";
import { synthNoteOn, synthNoteOff } from "@/lib/synth";
import { unlock } from "@/lib/audio-context";
import type { ColorMode } from "@/store/useSettingsStore";

const JUDGE_HOLD_MS = 220; // how long the judge flash stays before clearing
const FADE_MS = 280; // note fade-in duration

export function NoteReadingStage({
  onOpenSettings,
  onExit,
}: {
  onOpenSettings: () => void;
  onExit: () => void;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastNoteRef = useRef<number | null>(null);
  const noteAppearRef = useRef(0);

  const phase = useNoteReadingStore((s) => s.phase);
  const noteKey = useNoteReadingStore((s) => s.noteKey);
  const difficulty = useNoteReadingStore((s) => s.difficulty);
  const correctCount = useNoteReadingStore((s) => s.correctCount);
  const wrongCount = useNoteReadingStore((s) => s.wrongCount);
  const streak = useNoteReadingStore((s) => s.streak);
  const bestStreak = useNoteReadingStore((s) => s.bestStreak);
  const setKey = useNoteReadingStore((s) => s.setKey);
  const setDifficulty = useNoteReadingStore((s) => s.setDifficulty);
  const startSession = useNoteReadingStore((s) => s.startSession);
  const synthEnabled = useSettingsStore((s) => s.synthEnabled);

  // Ensure a fresh session exists on mount.
  useEffect(() => {
    startSession();
  }, [startSession]);

  // --- Input detection: middle C to start, then note matching ---
  useEffect(() => {
    if (phase === "finished") return;
    let prevActive = useInputStore.getState().active;
    const unsub = useInputStore.subscribe((state) => {
      // Detect newly pressed notes.
      const now: number[] = [];
      for (const [midi] of state.active) {
        if (!prevActive.has(midi)) now.push(midi);
      }
      prevActive = state.active;
      if (now.length === 0) return;

      const s = useNoteReadingStore.getState();
      if (s.phase === "prompt") {
        // Require middle C (MIDI 60) to begin.
        if (now.includes(60)) {
          s.begin();
        }
        return;
      }
      if (s.phase === "active" && s.currentNote != null) {
        const target = s.currentNote;
        if (now.includes(target)) {
          // Correct: mark the active note green so the piano shows it.
          useInputStore.getState().setMatchResult(target, "hit");
          // Correct: play the note briefly for audible feedback.
          unlock();
          if (synthEnabled) synthNoteOn(target, 100, true);
          window.setTimeout(() => synthNoteOff(target), 260);
          s.markCorrect();
        } else {
          // Wrong: flash the pressed key red.
          useInputStore.getState().flashWrong(now[0]);
          // Wrong: flash and let the user retry the same note.
          s.markWrong(now[0]);
        }
      }
    });
    return unsub;
  }, [phase, synthEnabled]);

  // --- Render loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let layout: PianoLayout | null = null;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Same layout function the other modes use, so the keyboard size/height
      // is identical (pianoHeight = clamp(96, 160, canvasH * 0.16)).
      layout = computeLayout(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const loop = () => {
      const s = useNoteReadingStore.getState();
      const input = useInputStore.getState();
      const settings = useSettingsStore.getState();
      // Reset the fade-in clock whenever a new prompt note appears.
      if (s.currentNote !== lastNoteRef.current) {
        lastNoteRef.current = s.currentNote;
        noteAppearRef.current = performance.now();
      }
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const judge = performance.now() - s.judgeAt < JUDGE_HOLD_MS ? s.judge : "none";
      // Fade-in progress: 0 -> 1 over FADE_MS after the note appears.
      const fade = s.phase === "prompt" || s.currentNote == null
        ? 0
        : Math.min(1, (performance.now() - noteAppearRef.current) / FADE_MS);

      // Prune wrong-flash / history so red feedback fades out over time.
      const nowSec = performance.now() / 1000;
      input.pruneWrongFlash(nowSec);

      // Clear, draw the staff (reserving the piano height), then the piano.
      // Both share the same layout so the keyboard matches other modes exactly.
      ctx.clearRect(0, 0, w, h);
      const pianoH = layout ? layout.pianoHeight : Math.max(96, Math.min(160, h * 0.16));
      drawReadingStaff({
        ctx,
        width: w,
        height: h,
        bottomReserve: pianoH,
        key: s.noteKey,
        note: s.currentNote,
        fade,
        judge,
      });

      if (layout) {
        drawPiano({
          ctx,
          layout,
          pianoTop: h - pianoH,
          active: input.active,
          wrongFlash: input.wrongFlash,
          songSounding: new Map(),
          colorMode: settings.colorMode as ColorMode,
          showLabels: settings.showLabels,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const allowedKeys = keysForDifficulty(difficulty);

  return (
    <div className="relative flex h-full w-full flex-col bg-bg-0 text-fg">
      <header className="flex items-center justify-between border-b border-bg-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit} title={t("home.app_title")}>
            {"← " + t("reading.back")}
          </Button>
          <span className="text-xs text-muted">{t("reading.mode_label")}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Key selector */}
          <div className="flex items-center rounded-md border border-bg-2 bg-bg-2 p-0.5">
            {(allowedKeys as NoteKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setKey(k)}
                className={
                  "rounded px-2 py-0.5 text-xs transition-colors " +
                  (noteKey === k ? "bg-accent text-white" : "text-muted hover:bg-bg-3")
                }
                disabled={noteKey === k}
              >
                {KEY_LABELS[k]}
              </button>
            ))}
          </div>
          {/* Difficulty selector */}
          <div className="flex items-center rounded-md border border-bg-2 bg-bg-2 p-0.5">
            {(["easy", "medium", "hard"] as ReadingDifficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={
                  "rounded px-2 py-0.5 text-xs transition-colors " +
                  (difficulty === d ? "bg-accent text-white" : "text-muted hover:bg-bg-3")
                }
                disabled={difficulty === d}
              >
                {t("difficulties." + d)}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={onOpenSettings} title={t("header.settings_tip")}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="block h-full w-full" />

        {/* Prompt overlay: press middle C to begin */}
        {phase === "prompt" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-xl border border-bg-2 bg-bg-1 px-10 py-8 text-center shadow-lg">
              <p className="text-lg font-semibold text-fg">{t("reading.press_middle_c")}</p>
              <p className="mt-2 text-sm text-muted">{t("reading.press_middle_c_hint")}</p>
            </div>
          </div>
        )}

        {/* Live stats strip */}
        {phase === "active" && (
          <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1 rounded-md bg-bg-1/80 px-3 py-2 text-xs text-muted">
            <span>{t("reading.correct")}: <b className="text-fg">{correctCount}</b></span>
            <span>{t("reading.wrong")}: <b className="text-fg">{wrongCount}</b></span>
            <span>{t("reading.streak")}: <b className="text-fg">{streak}</b> / {bestStreak}</span>
          </div>
        )}
      </div>
    </div>
  );
}

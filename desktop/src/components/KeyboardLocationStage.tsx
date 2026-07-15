// Keyboard-location recognition stage (T10): the learner sees a target note
// name and must tap the correct physical key on the rendered piano. This is
// the only branch whose answer modality is the piano itself.
//
// The stage generates a random concrete target (a MIDI note) for each card,
// manages the comparison locally (pitch-class or exact depending on level),
// and submits the outcome via `submitOutcome` (bypassing the store's string
// comparison since the target is instance-specific).
//
// Shares the adaptive soft timer, challenge-mode HUD, progression cue, and
// session-complete overlay with the other stages.

import { useEffect, useRef, useState } from "react";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useNoteReadingStore,
  selectCurrentEntityKey,
} from "@/store/useNoteReadingStore";
import { RhythmGameHUD } from "@/components/RhythmGameHUD";
import { ReadingChallengeResult } from "@/components/ReadingChallengeResult";
import { computeLayout, midiFromPoint } from "@/lib/piano-layout";
import { drawPiano } from "@/components/Piano/PianoKeyboard";
import { timerFrac, timeLimitMs as timeLimitFor } from "@/lib/practice-controller";
import { useT } from "@/lib/i18n";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { ActiveNote } from "@/store/useInputStore";
import {
  generateKeyLocTarget,
  keyLocMatches,
  type KeyLocTarget,
} from "@/lib/keyboard-location-generator";
import type { PianoLayout } from "@/lib/piano-layout";
import type { ColorMode } from "@/store/useSettingsStore";

const JUDGE_HOLD_MS = 260;
const TIMER_TICK_MS = 50;

export function KeyboardLocationStage({
  onOpenSettings,
  onExit,
  onRetry,
}: {
  onOpenSettings: () => void;
  onExit: () => void;
  onRetry?: () => void;
}) {
  const t = useT();

  const phase = useNoteReadingStore((s) => s.phase);
  const session = useNoteReadingStore((s) => s.session);
  const judge = useNoteReadingStore((s) => s.judge);
  const lastProgressionCue = useNoteReadingStore((s) => s.lastProgressionCue);
  const practiceMode = useNoteReadingStore((s) => s.practiceMode);
  const runEnded = useNoteReadingStore((s) => s.runEnded);
  const startSession = useNoteReadingStore((s) => s.startSession);
  const submitOutcome = useNoteReadingStore((s) => s.submitOutcome);
  const answerTimeout = useNoteReadingStore((s) => s.answerTimeout);
  const clearJudge = useNoteReadingStore((s) => s.clearJudge);
  const dismissProgressionCue = useNoteReadingStore((s) => s.dismissProgressionCue);
  const switchPracticeMode = useNoteReadingStore((s) => s.switchPracticeMode);
  const colorMode = useSettingsStore((s) => s.colorMode);
  const showLabels = useSettingsStore((s) => s.showLabels);

  const isChallenge = practiceMode === "challenge";

  const [elapsedFrac, setElapsedFrac] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ephemeral target (random per card) + the clicked key for visual feedback.
  const targetRef = useRef<KeyLocTarget | null>(null);
  const judgeTargetRef = useRef<KeyLocTarget | null>(null);
  // Visual feedback: active notes (green/red highlight on the piano).
  const activeRef = useRef<Map<number, ActiveNote>>(new Map());
  const wrongFlashRef = useRef<Map<number, number>>(new Map());

  // Generate a fresh target when the current entity key changes.
  const currentEntityKey = useNoteReadingStore((s) =>
    s.session ? selectCurrentEntityKey(s) : null,
  );
  useEffect(() => {
    if (!currentEntityKey) {
      targetRef.current = null;
      return;
    }
    targetRef.current = generateKeyLocTarget(currentEntityKey, Math.random);
    // Clear visual feedback for the new card.
    activeRef.current = new Map();
    wrongFlashRef.current = new Map();
  }, [currentEntityKey]);

  // Ensure a session exists on mount.
  useEffect(() => {
    if (useNoteReadingStore.getState().session) return;
    void startSession();
  }, [startSession]);

  // Judge flash auto-clear.
  useEffect(() => {
    if (judge === "none") return;
    const id = window.setTimeout(() => clearJudge(), JUDGE_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [judge, clearJudge]);

  // Adaptive soft-timer countdown.
  const firedRef = useRef(false);
  useEffect(() => {
    if (phase !== "active" || !session) return;
    firedRef.current = false;
    setElapsedFrac(1);

    const limit = timeLimitFor(session);
    const appearAt = performance.now();
    const id = window.setInterval(() => {
      const elapsed = performance.now() - appearAt;
      const { frac } = timerFrac(elapsed, limit);
      setElapsedFrac(frac);
      if (elapsed >= limit && !firedRef.current) {
        firedRef.current = true;
        answerTimeout();
      }
    }, TIMER_TICK_MS);
    return () => window.clearInterval(id);
  }, [phase, session, answerTimeout]);

  // Piano render loop.
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
      layout = computeLayout(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const loop = () => {
      if (!layout) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const pianoTop = layout.height - layout.pianoHeight;

      ctx.clearRect(0, 0, w, h);
      drawPiano({
        ctx,
        layout,
        pianoTop,
        active: activeRef.current,
        wrongFlash: wrongFlashRef.current,
        songSounding: new Map(),
        colorMode: colorMode as ColorMode,
        showLabels,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [colorMode, showLabels]);

  // Pointer handler: hit-test → compare to target → submit outcome.
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "active" || judge !== "none") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Compute layout fresh (canvas may have resized).
    const layout = computeLayout(rect.width, rect.height);
    const clickedMidi = midiFromPoint(layout, x, y);
    if (clickedMidi == null) return;

    // Snapshot target for the judge flash.
    judgeTargetRef.current = targetRef.current;
    const target = targetRef.current;
    if (!target) return;

    const isCorrect = keyLocMatches(target, clickedMidi);

    // Visual feedback: highlight the clicked key.
    if (isCorrect) {
      activeRef.current = new Map([[clickedMidi, {
        velocity: 100, startTime: performance.now(), source: "keyboard" as const, matchResult: "hit",
      }]]);
    } else {
      // Show both the clicked key (red) and the correct key (green).
      const m = new Map<number, ActiveNote>();
      m.set(clickedMidi, {
        velocity: 100, startTime: performance.now(), source: "keyboard" as const, matchResult: "wrong",
      });
      m.set(target.midi, {
        velocity: 100, startTime: performance.now(), source: "keyboard" as const, matchResult: "hit",
      });
      activeRef.current = m;
    }

    submitOutcome(isCorrect ? "correct" : "wrong");
  };

  const remaining = session?.queue.length ?? 0;
  const correctCount = session?.correctCount ?? 0;
  const wrongCount = session?.wrongCount ?? 0;
  const slowCount = session?.slowCount ?? 0;
  const streak = session?.streak ?? 0;

  // Display name for the prompt: during judge flash show the judged target;
  // otherwise the current target.
  const flashing = judge !== "none";
  const displayTarget = flashing ? judgeTargetRef.current : targetRef.current;

  return (
    <div className="relative flex h-full w-full flex-col bg-bg-0 text-fg">
      <header className="flex items-center justify-between border-b border-bg-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit} title={t("home.app_title")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("reading.back")}
          </Button>
          <span className="text-xs text-muted">{t("course.branch_keyboard")}</span>
          <div className="flex items-center rounded-md border border-bg-2 bg-bg-2 p-0.5">
            {(["practice", "challenge"] as const).map((m) => (
              <button
                key={m}
                onClick={() => void switchPracticeMode(m)}
                disabled={judge !== "none" || runEnded}
                className={
                  "rounded px-2 py-0.5 text-xs transition-colors " +
                  (practiceMode === m ? "bg-accent text-white" : "text-muted hover:bg-bg-3")
                }
              >
                {m === "practice" ? t("reading.practice_mode") : t("reading.challenge_mode")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          {phase === "active" && (
            <>
              <span>{t("reading.correct")}: <b className="text-accent">{correctCount}</b></span>
              <span>{t("reading.wrong")}: <b className="text-fg">{wrongCount}</b></span>
              {slowCount > 0 && (
                <span>{t("reading.slow")}: <b className="text-fg">{slowCount}</b></span>
              )}
              <span>{t("reading.streak")}: <b className="text-fg">{streak}</b></span>
              <span>{t("reading.remaining")}: <b className="text-fg">{remaining}</b></span>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={onOpenSettings} title={t("header.settings_tip")}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Prompt + timer */}
        <div className="flex flex-col items-center justify-center gap-3 pt-6">
          {phase === "active" && displayTarget && (
            <div className="text-center">
              <p className="mb-1 text-xs text-muted">{t("reading.prompt_keyboard_location")}</p>
              <p className="text-4xl font-bold tracking-wide text-accent">
                {displayTarget.displayName}
              </p>
            </div>
          )}
          {phase === "active" && (
            <div className="mx-auto flex w-64 items-center gap-2">
              <span className="w-16 shrink-0 text-right text-[10px] text-muted">{t("reading.fluency")}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-3">
                <div
                  className="h-full rounded-full transition-[width,background-color] duration-75"
                  style={{
                    width: `${Math.round(elapsedFrac * 100)}%`,
                    backgroundColor: barColor(elapsedFrac),
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Interactive piano canvas */}
        <div className="relative flex-1 overflow-hidden">
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none"
            onPointerDown={handlePointerDown}
          />

          {isChallenge && phase === "active" && <RhythmGameHUD />}

          {isChallenge && runEnded && onRetry && (
            <ReadingChallengeResult onRetry={onRetry} onExit={onExit} />
          )}

          {phase === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted">{t("reading.loading")}</p>
            </div>
          )}

          {phase === "complete" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-sm rounded-xl border border-bg-2 bg-bg-1 px-8 py-6 text-center shadow-lg">
                <p className="text-base font-semibold text-fg">{t("reading.complete")}</p>
                <div className="mt-4 flex justify-center gap-4 text-xs text-muted">
                  <span>{t("reading.correct")}: <b className="text-accent">{correctCount}</b></span>
                  <span>{t("reading.wrong")}: <b className="text-fg">{wrongCount}</b></span>
                </div>
                <Button variant="default" size="sm" className="mt-5" onClick={onExit}>
                  {t("reading.back")}
                </Button>
              </div>
            </div>
          )}

          {lastProgressionCue && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-0/70 backdrop-blur-sm">
              <div className="max-w-xs rounded-xl border border-accent/40 bg-bg-1 px-8 py-6 text-center shadow-xl">
                <p className="text-lg font-bold text-accent">{t("reading.level_mastered")}</p>
                <p className="mt-1 text-sm text-muted">{t(lastProgressionCue.titleKey)}</p>
                <Button variant="default" size="sm" className="mt-5" onClick={dismissProgressionCue}>
                  {t("reading.keep_going")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function barColor(frac: number): string {
  if (frac > 0.5) return "#22c55e";
  if (frac > 0.25) return "#f59e0b";
  return "#ef4444";
}

// Note Reading stage (T5): reading-recognition practice driven by the SM-2
// daily queue. For each card the learner sees a note on the staff and taps the
// matching letter name (C/D/E/F/G/A/B). An adaptive soft timer (RMA × 1.5)
// reddens as it nears zero; a timeout counts as "slow" (fluency miss, card
// repeats). Wrong = immediate judge + advance (no retry). Mastering a level
// fires a progression cue. All decisions live in practice-controller.ts; this
// component owns only rendering + the rAF countdown.

import { useEffect, useRef, useState } from "react";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useNoteReadingStore,
  selectCurrentPitch,
} from "@/store/useNoteReadingStore";
import { RhythmGameHUD } from "@/components/RhythmGameHUD";
import { ReadingChallengeResult } from "@/components/ReadingChallengeResult";
import { drawReadingStaff } from "@/lib/reading-staff-renderer";
import {
  LETTER_NAMES,
  nameForPitch,
  timerFrac,
  timeLimitMs as timeLimitFor,
} from "@/lib/practice-controller";
import { useT } from "@/lib/i18n";
import { unlock } from "@/lib/audio-context";
import { synthNoteOn, synthNoteOff } from "@/lib/synth";
import { useSettingsStore } from "@/store/useSettingsStore";

const JUDGE_HOLD_MS = 260; // how long the judge flash stays before clearing
const FADE_MS = 280; // note fade-in duration
const TIMER_TICK_MS = 50; // countdown bar refresh cadence

export function NoteReadingStage({
  onOpenSettings,
  onExit,
  onRetry,
}: {
  onOpenSettings: () => void;
  onExit: () => void;
  /** Retry a challenge run (re-launch the same scope). Practice mode calls onExit. */
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
  const answerLetter = useNoteReadingStore((s) => s.answerLetter);
  const answerTimeout = useNoteReadingStore((s) => s.answerTimeout);
  const clearJudge = useNoteReadingStore((s) => s.clearJudge);
  const dismissProgressionCue = useNoteReadingStore((s) => s.dismissProgressionCue);
  const switchPracticeMode = useNoteReadingStore((s) => s.switchPracticeMode);
  const synthEnabled = useSettingsStore((s) => s.synthEnabled);

  const isChallenge = practiceMode === "challenge";

  // Live countdown state (kept out of the store — it's purely presentational).
  const [elapsedFrac, setElapsedFrac] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ensure a session exists on mount. When launched from the course browser the
  // session is already populated (daily mix or level drill), so this is a
  // fallback for direct entry only — never clobbers a pre-started session.
  useEffect(() => {
    if (useNoteReadingStore.getState().session) return;
    void startSession();
  }, [startSession]);

  // --- Judge flash auto-clear ---
  useEffect(() => {
    if (judge === "none") return;
    const id = window.setTimeout(() => clearJudge(), JUDGE_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [judge, clearJudge]);

  // --- Adaptive soft-timer countdown ---
  // Drives the reddening bar. When elapsed exceeds the limit, dispatch a slow
  // outcome exactly once per card. `firedRef` guards re-entry: it resets to
  // false whenever the front card changes, and latches true after a timeout so
  // the same card can't time out twice (e.g. during the judge-flash hold).
  const firedRef = useRef(false);
  useEffect(() => {
    if (phase !== "active" || !session) return;
    firedRef.current = false; // new card -> allow one timeout
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

  // --- Staff render loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let lastPitch: number | null = null;
    let appearAt = 0;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const loop = () => {
      const s = useNoteReadingStore.getState();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // During a judge flash, render the JUDGED card (judgePitch) so the tint
      // lands on the note the learner just answered, not its successor.
      const flashing = s.judge !== "none";
      const pitch = flashing ? s.judgePitch : selectCurrentPitch(s);
      if (pitch !== lastPitch) {
        lastPitch = pitch;
        appearAt = performance.now();
      }
      const fade = pitch == null ? 0 : Math.min(1, (performance.now() - appearAt) / FADE_MS);
      const judgeNow = flashing ? (s.judge === "correct" ? "correct" : "wrong") : "none";

      ctx.clearRect(0, 0, w, h);
      // No piano to reserve space for anymore — bottomReserve 0.
      drawReadingStaff({
        ctx,
        width: w,
        height: h,
        key: "C", // the reading branch is entirely C-major for now
        note: pitch,
        fade,
        judge: judgeNow,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // --- Letter button handler ---
  const handleLetter = (letter: string) => {
    if (phase !== "active" || judge !== "none") return; // ignore taps during a flash
    const pitch = selectCurrentPitch(useNoteReadingStore.getState());
    const isCorrect = pitch != null && letter === nameForPitch(pitch);
    unlock();
    // Audible confirmation only on a correct answer — playing the note on a
    // wrong tap would reward the mistake with the right pitch.
    if (synthEnabled && isCorrect && pitch != null) {
      synthNoteOn(pitch, 100, true);
      window.setTimeout(() => synthNoteOff(pitch), 240);
    }
    answerLetter(letter);
  };

  // --- Keyboard shortcuts: A B C D E F G map to the letter buttons ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toUpperCase();
      if ((LETTER_NAMES as readonly string[]).includes(k)) {
        e.preventDefault();
        handleLetter(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, judge, synthEnabled]);

  const remaining = session?.queue.length ?? 0;
  const correctCount = session?.correctCount ?? 0;
  const wrongCount = session?.wrongCount ?? 0;
  const slowCount = session?.slowCount ?? 0;
  const streak = session?.streak ?? 0;

  return (
    <div className="relative flex h-full w-full flex-col bg-bg-0 text-fg">
      <header className="flex items-center justify-between border-b border-bg-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit} title={t("home.app_title")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("reading.back")}
          </Button>
          <span className="text-xs text-muted">{t("reading.mode_label")}</span>
          {/* Practice | Challenge toggle (T7). Switching re-launches the current
              scope in the new mode, so it's disabled mid-answer-flash. */}
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
        {/* Staff canvas */}
        <div className="relative flex-1 overflow-hidden">
          <canvas ref={canvasRef} className="block h-full w-full" />

          {/* Challenge HUD (HP / combo / score / progress). The HUD self-gates
              on the practice flag which the store sets in challenge mode. */}
          {isChallenge && phase === "active" && <RhythmGameHUD />}

          {/* Challenge run-result panel (HP emptied or queue cleared). */}
          {isChallenge && runEnded && onRetry && (
            <ReadingChallengeResult
              onRetry={onRetry}
              onExit={onExit}
            />
          )}

          {/* Loading overlay */}
          {phase === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted">{t("reading.loading")}</p>
            </div>
          )}

          {/* Session complete overlay */}
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

          {/* Progression cue overlay */}
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

        {/* Adaptive soft-timer bar + letter buttons */}
        {phase === "active" && (
          <div className="border-t border-bg-2 bg-bg-1 px-4 pb-4 pt-3">
            {/* Countdown bar: green -> red as it empties. */}
            <div className="mx-auto mb-3 flex max-w-md items-center gap-2">
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

            <p className="mb-2 text-center text-xs text-muted">{t("reading.prompt_name")}</p>
            {/* Letter-name button panel */}
            <div className="mx-auto flex max-w-md justify-center gap-2">
              {LETTER_NAMES.map((letter) => (
                <button
                  key={letter}
                  onClick={() => handleLetter(letter)}
                  disabled={judge !== "none"}
                  className={
                    "h-12 w-12 rounded-lg border text-lg font-semibold transition-colors " +
                    (judge === "none"
                      ? "border-bg-3 bg-bg-2 text-fg hover:bg-bg-3 active:bg-bg-3"
                      : "border-bg-3 bg-bg-2 text-muted opacity-60")
                  }
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- helpers -----------------------------------------------------------------

/** Countdown bar color: green near full -> amber -> red near empty. */
function barColor(frac: number): string {
  if (frac > 0.5) return "#22c55e"; // green-500
  if (frac > 0.25) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

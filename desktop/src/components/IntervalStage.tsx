// Interval recognition stage (T9): the learner sees two notes on a treble staff
// (harmonic stacked or melodic sequential) and taps the correct interval name
// from 7 buttons (2nd through 8ve). Each prompt generates a fresh random
// pitch-pair instance of the interval category, so the learner practices
// recognizing the abstract interval, not memorizing specific pitches.
//
// Shares the adaptive soft timer, challenge-mode HUD, progression cue, and
// session-complete overlay with the other stages via the same store. The
// correct-answer resolution is branch-aware (correctAnswerForEntityKey).
//
// Instance management: the random pitch-pair is ephemeral rendering state
// (not persisted). It's stored in refs so the rAF loop can read it without
// triggering React re-renders. On answer, the current instance is snapshotted
// into a judgeInstanceRef so the flash renders the answered instance.

import { useEffect, useRef, useState } from "react";
import { Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useNoteReadingStore,
  selectCurrentEntityKey,
  selectJudgeEntityKey,
} from "@/store/useNoteReadingStore";
import { RhythmGameHUD } from "@/components/RhythmGameHUD";
import { ReadingChallengeResult } from "@/components/ReadingChallengeResult";
import { drawIntervalStaff } from "@/lib/interval-staff-renderer";
import {
  INTERVAL_ANSWER_BUTTONS,
  timerFrac,
  timeLimitMs as timeLimitFor,
} from "@/lib/practice-controller";
import { useT } from "@/lib/i18n";
import {
  generateIntervalInstance,
  intervalEntityKeyFromString,
  type IntervalInstance,
} from "@/lib/interval-generator";

const JUDGE_HOLD_MS = 260;
const FADE_MS = 280;
const TIMER_TICK_MS = 50;

export function IntervalStage({
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
  const answer = useNoteReadingStore((s) => s.answer);
  const answerTimeout = useNoteReadingStore((s) => s.answerTimeout);
  const clearJudge = useNoteReadingStore((s) => s.clearJudge);
  const dismissProgressionCue = useNoteReadingStore((s) => s.dismissProgressionCue);
  const switchPracticeMode = useNoteReadingStore((s) => s.switchPracticeMode);

  const isChallenge = practiceMode === "challenge";

  const [elapsedFrac, setElapsedFrac] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ephemeral interval instance (random pitch-pair for the current card).
  // Stored in refs so the rAF loop reads them without triggering re-renders.
  const currentInstanceRef = useRef<IntervalInstance | null>(null);
  const judgeInstanceRef = useRef<IntervalInstance | null>(null);

  // Generate a fresh instance whenever the current entity key changes.
  const currentEntityKey = useNoteReadingStore((s) =>
    s.session ? selectCurrentEntityKey(s) : null,
  );
  useEffect(() => {
    if (!currentEntityKey) {
      currentInstanceRef.current = null;
      return;
    }
    const size = intervalEntityKeyFromString(currentEntityKey);
    if (!size) {
      currentInstanceRef.current = null;
      return;
    }
    currentInstanceRef.current = generateIntervalInstance(size, Math.random);
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

  // Staff render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let lastKey: string | null = null;
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
      const flashing = s.judge !== "none";
      const ek = flashing ? selectJudgeEntityKey(s) : selectCurrentEntityKey(s);

      if (ek !== lastKey) {
        lastKey = ek;
        appearAt = performance.now();
      }
      const fade = ek == null ? 0 : Math.min(1, (performance.now() - appearAt) / FADE_MS);
      const judgeNow = flashing ? (s.judge === "correct" ? "correct" : "wrong") : "none";

      // During a flash, render the snapshotted judge instance; otherwise the
      // current instance. This ensures the tinted notes match what the learner
      // just answered, not a freshly generated pair for the next card.
      const instance = flashing ? judgeInstanceRef.current : currentInstanceRef.current;

      ctx.clearRect(0, 0, w, h);
      drawIntervalStaff({ ctx, width: w, height: h, instance, fade, judge: judgeNow });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Answer handler: snapshot the current instance before answering so the
  // judge flash renders THIS interval, not the next card's.
  const handleAnswer = (value: string) => {
    if (phase !== "active" || judge !== "none") return;
    judgeInstanceRef.current = currentInstanceRef.current;
    answer(value);
  };

  // Keyboard shortcuts: 1–7 map to the 7 interval buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= INTERVAL_ANSWER_BUTTONS.length) {
        e.preventDefault();
        handleAnswer(INTERVAL_ANSWER_BUTTONS[num - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, judge]);

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
          <span className="text-xs text-muted">{t("course.branch_interval")}</span>
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
        <div className="relative flex-1 overflow-hidden">
          <canvas ref={canvasRef} className="block h-full w-full" />

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

        {phase === "active" && (
          <div className="border-t border-bg-2 bg-bg-1 px-4 pb-4 pt-3">
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

            <p className="mb-2 text-center text-xs text-muted">{t("reading.prompt_interval")}</p>
            <div className="mx-auto grid max-w-md grid-cols-7 gap-1.5">
              {INTERVAL_ANSWER_BUTTONS.map((name) => (
                <button
                  key={name}
                  onClick={() => handleAnswer(name)}
                  disabled={judge !== "none"}
                  className={
                    "h-12 rounded-lg border text-sm font-semibold transition-colors " +
                    (judge === "none"
                      ? "border-bg-3 bg-bg-2 text-fg hover:bg-bg-3 active:bg-bg-3"
                      : "border-bg-3 bg-bg-2 text-muted opacity-60")
                  }
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function barColor(frac: number): string {
  if (frac > 0.5) return "#22c55e";
  if (frac > 0.25) return "#f59e0b";
  return "#ef4444";
}

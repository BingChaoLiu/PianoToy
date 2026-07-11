// ReadingChallengeResult (T7): end-of-run panel for the reading challenge.
//
// Reads the rhythm-game layer (rating, score, max combo, rank) plus the
// reading session's card stats (correct/wrong/slow). Reuses the existing
// rating + rank helpers from useRhythmGameStore; the only thing bespoke here
// is tying those to the reading session and routing retry/exit back to the
// reading shell rather than the score-practice machinery.

import { Home, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRhythmGameStore, RANK_TIERS, type Rating } from "@/store/useRhythmGameStore";
import { useNoteReadingStore } from "@/store/useNoteReadingStore";
import { useT } from "@/lib/i18n";
import { formatTime } from "@/lib/note-utils";

const RATING_COLORS: Record<Rating, string> = {
  S: "text-yellow-400",
  A: "text-green-400",
  B: "text-blue-400",
  C: "text-orange-400",
  D: "text-red-400",
};

export function ReadingChallengeResult({
  onRetry,
  onExit,
}: {
  onRetry: () => void;
  onExit: () => void;
}) {
  const t = useT();
  const rg = useRhythmGameStore();
  const session = useNoteReadingStore((s) => s.session);
  const startTime = useNoteReadingStore((s) => s.startTime);

  const correct = session?.correctCount ?? 0;
  const wrong = session?.wrongCount ?? 0;
  const slow = session?.slowCount ?? 0;
  const total = correct + wrong;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const elapsed = startTime ? (performance.now() - startTime) / 1000 : 0;
  const rating = rg.rating ?? "D";
  const failed = rg.isFailed;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-0/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-bg-2 bg-bg-1 p-6 shadow-xl">
        <h2 className="mb-4 text-center text-lg font-bold text-fg">
          {failed ? t("result.failed") : t("reading.run_result_title")}
        </h2>

        <div className="mb-4 text-center">
          <span className={"text-5xl font-black " + RATING_COLORS[rating]}>{rating}</span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <Stat label={t("result.score")} value={rg.score.toLocaleString()} accent />
          <Stat label={t("result.max_combo")} value={String(rg.maxCombo)} />
          <Stat label={t("stats.accuracy")} value={`${accuracy}%`} />
          <Stat label={t("result.time")} value={formatTime(elapsed)} />
          <Stat label={t("reading.correct")} value={String(correct)} good />
          <Stat label={t("reading.wrong")} value={String(wrong)} bad />
          {slow > 0 && <Stat label={t("reading.slow")} value={String(slow)} />}
        </div>

        <div className="mb-4 flex items-center gap-2 rounded bg-bg-2 px-3 py-2">
          <Trophy className="h-4 w-4 text-accent" />
          <span className="text-xs text-muted">{t("home.rank")}:</span>
          <span className="text-xs font-semibold text-fg">
            {RANK_TIERS.find((r) => r.tier === rg.rankTier)?.label ?? "Beginner"}
          </span>
          <span className="ml-auto text-xs text-muted">
            {rg.totalPoints.toLocaleString()} pts
          </span>
        </div>

        <div className="flex gap-2">
          <Button variant="default" size="sm" className="flex-1" onClick={onRetry}>
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("result.retry")}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onExit}>
            <Home className="mr-1 h-3 w-3" />
            {t("result.home")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  good,
  bad,
  accent,
}: {
  label: string;
  value: string;
  good?: boolean;
  bad?: boolean;
  accent?: boolean;
}) {
  const color = good ? "text-green-400" : bad ? "text-red-400" : accent ? "text-accent" : "text-fg";
  return (
    <div className="rounded bg-bg-2 px-3 py-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={"text-sm font-semibold " + color}>{value}</div>
    </div>
  );
}

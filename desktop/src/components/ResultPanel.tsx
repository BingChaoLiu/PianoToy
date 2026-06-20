// ResultPanel: shown after a practice session ends.

import { useEffect, useState } from "react";
import { X, Trophy, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRhythmGameStore, RANK_TIERS, type Rating } from "@/store/useRhythmGameStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useT } from "@/lib/i18n";

const RATING_COLORS: Record<Rating, string> = {
  S: "text-yellow-400",
  A: "text-green-400",
  B: "text-blue-400",
  C: "text-orange-400",
  D: "text-red-400",
};

interface Props {
  onRetry?: () => void;
}

export function ResultPanel({ onRetry }: Props) {
  const t = useT();
  const rg = useRhythmGameStore();
  const practice = usePracticeStore();
  const setMode = useAppModeStore((s) => s.setMode);
  const song = useSongStore((s) => s.song);
  const playback = usePlaybackStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (rg.isFinished || rg.isFailed) {
      const timer = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [rg.isFinished, rg.isFailed]);

  if (!visible) return null;

  const stats = practice.stats;
  const total = stats.hits + stats.wrong + stats.missed;
  const acc = total === 0 ? 0 : stats.hits / total;
  const elapsed = rg.sessionStartTime ? Math.round((Date.now() - rg.sessionStartTime) / 1000) : 0;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const rating = rg.rating ?? "D";

  const handleRetry = () => {
    setVisible(false);
    rg.resetSession();
    practice.resetStats();
    if (song) {
      practice.resetForSong(song);
      rg.startSession();
      playback.pause();
      playback.seek(0, song);
    }
    practice.setEnabled(true);
    if (onRetry) onRetry();
  };

  const handleHome = () => {
    setVisible(false);
    rg.resetSession();
    practice.setEnabled(false);
    practice.resetStats();
    playback.pause();
    useSongStore.getState().unload();
    const currentMode = useAppModeStore.getState().mode;
    if (currentMode === "score-practice") {
      setMode("score-practice");
    } else {
      setMode("home");
    }
  };

  const handleContinue = () => {
    setVisible(false);
    playback.pause();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-0/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-bg-2 bg-bg-1 p-6 shadow-xl">
        <Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={handleContinue}>
          <X className="h-4 w-4" />
        </Button>

        <h2 className="mb-4 text-center text-lg font-bold text-fg">
          {rg.isFailed ? t("result.failed") : t("result.complete")}
        </h2>

        <div className="mb-4 text-center">
          <span className={"text-5xl font-black " + RATING_COLORS[rating]}>{rating}</span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <StatBox label={t("result.score")} value={rg.score.toLocaleString()} />
          <StatBox label={t("result.max_combo")} value={String(rg.maxCombo)} />
          <StatBox label={t("result.accuracy")} value={(acc * 100).toFixed(1) + "%"} />
          <StatBox label={t("result.time")} value={minutes + ":" + String(seconds).padStart(2, "0")} />
          <StatBox label={t("stats.hits")} value={String(stats.hits)} good />
          <StatBox label={t("stats.missed")} value={String(stats.missed)} bad />
          <StatBox label={t("stats.wrong")} value={String(stats.wrong)} bad />
          <StatBox label={t("result.points_earned")} value={"+" + rg.score} accent />
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

        {/* Difficulty up suggestion for high ratings */}
        {rating === "S" && (
          <div className="mb-3 rounded border border-accent/30 bg-accent/10 px-3 py-2 text-center">
            <div className="text-xs font-semibold text-accent">{t("result.difficulty_up")}</div>
            <div className="mt-1 text-[10px] text-muted">{t("result.difficulty_up_desc")}</div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="default" size="sm" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("result.retry")}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={handleHome}>
            <Home className="mr-1 h-3 w-3" />
            {t("result.home")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label, value, good, bad, accent,
}: { label: string; value: string; good?: boolean; bad?: boolean; accent?: boolean }) {
  const color = good ? "text-green-400" : bad ? "text-red-400" : accent ? "text-accent" : "text-fg";
  return (
    <div className="rounded bg-bg-2 px-3 py-2">
      <div className="text-[10px] text-muted">{label}</div>
      <div className={"text-sm font-semibold " + color}>{value}</div>
    </div>
  );
}

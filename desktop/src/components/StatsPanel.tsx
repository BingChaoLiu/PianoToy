// Practice statistics overlay.

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useT } from "@/lib/i18n";

export function StatsPanel() {
  const t = useT();
  const enabled = usePracticeStore((s) => s.enabled);
  const stats = usePracticeStore((s) => s.stats);
  const resetStats = usePracticeStore((s) => s.resetStats);
  const resetForSong = usePracticeStore((s) => s.resetForSong);
  const song = useSongStore((s) => s.song);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => force((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (enabled) resetForSong(song);
  }, [song, enabled, resetForSong]);

  if (!enabled) return null;

  const total = stats.hits + stats.wrong + stats.missed;
  const acc = total === 0 ? 0 : stats.hits / total;
  const avgDelta = stats.timingCount > 0
    ? (stats.timingSum / stats.timingCount) * 1000
    : null;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-10 w-56 rounded-md border border-bg-2 bg-bg-1/95 px-3 py-2 text-xs backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-accent">{t("stats.title")}</span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={resetStats} title={t("stats.reset_tip")}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-1 font-mono">
        <Row label={t("stats.hits")} value={stats.hits} good={stats.hits > 0} />
        <Row label={t("stats.missed")} value={stats.missed} bad={stats.missed > 0} />
        <Row label={t("stats.wrong")} value={stats.wrong} bad={stats.wrong > 0} />
        <div className="border-t border-bg-2 pt-1">
          <Row label={t("stats.accuracy")} value={`${(acc * 100).toFixed(1)}%`} />
          {avgDelta != null && (
            <Row label={t("stats.avg_timing", { ms: avgDelta.toFixed(0) })} value="" />
          )}
        </div>
      </div>
      {!isPlaying && song && (
        <div className="mt-2 text-muted">{t("stats.no_data")}</div>
      )}
    </div>
  );
}

function Row({
  label, value, good, bad,
}: { label: string; value: string | number; good?: boolean; bad?: boolean }) {
  const color = good ? "text-green-400" : bad ? "text-red-400" : "text-fg";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}

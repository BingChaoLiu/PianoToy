// RhythmGameHUD: polished in-practice overlay with HP bar, score, combo, progress.

import { useEffect, useState } from "react";
import { Heart, Flame, Music } from "lucide-react";
import { useRhythmGameStore, MAX_HP } from "@/store/useRhythmGameStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useT } from "@/lib/i18n";

export function RhythmGameHUD() {
  const t = useT();
  const practiceEnabled = usePracticeStore((s) => s.enabled);
  const hp = useRhythmGameStore((s) => s.hp);
  const combo = useRhythmGameStore((s) => s.combo);
  const score = useRhythmGameStore((s) => s.score);
  const progress = useRhythmGameStore((s) => s.progress);

  const [, tick] = useState(0);
  useEffect(() => {
    if (!practiceEnabled) return;
    const id = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [practiceEnabled]);

  if (!practiceEnabled) return null;

  const hpPercent = (hp / MAX_HP) * 100;
  const hpColor = hpPercent > 60 ? "#22c55e" : hpPercent > 30 ? "#eab308" : "#ef4444";
  const hpBarColor = hpPercent > 60 ? "bg-green-500" : hpPercent > 30 ? "bg-yellow-500" : "bg-red-500";

  // Combo tier styling
  const comboStyle = combo >= 100
    ? "text-3xl text-purple-400 scale-125"
    : combo >= 50
    ? "text-2xl text-accent scale-110"
    : combo >= 25
    ? "text-xl text-accent"
    : combo >= 10
    ? "text-lg text-yellow-300"
    : "text-base text-fg";

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-2 select-none">
      {/* HP Bar */}
      <div className="flex items-center gap-2">
        <Heart
          className="h-4 w-4 transition-colors"
          style={{ color: hpColor }}
        />
        <div className="h-2.5 w-28 overflow-hidden rounded-full bg-bg-3/80 shadow-inner">
          <div
            className={"h-full rounded-full transition-all duration-200 " + hpBarColor}
            style={{ width: hpPercent + "%" }}
          />
        </div>
        <span className="w-8 text-right text-[10px] font-mono text-muted">{Math.round(hp)}</span>
      </div>

      {/* Score */}
      <div className="flex items-center gap-1.5">
        <Music className="h-3 w-3 text-accent/60" />
        <span className="text-xs font-mono text-fg">
          {t("hud.score")}: <span className="font-bold text-accent">{score.toLocaleString()}</span>
        </span>
      </div>

      {/* Combo */}
      {combo > 0 && (
        <div className="flex items-center gap-1.5">
          <Flame className={"h-3.5 w-3.5 " + (combo >= 25 ? "text-accent" : "text-yellow-400/60")} />
          <span className={"font-black transition-all duration-150 " + comboStyle}>
            {combo}x
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="mt-1 h-1 w-36 overflow-hidden rounded-full bg-bg-3/60">
        <div
          className="h-full rounded-full bg-accent/50 transition-all duration-300"
          style={{ width: (progress * 100) + "%" }}
        />
      </div>
    </div>
  );
}

// HomePage: app entry with three mode cards + rank display.

import { Music, Piano, GraduationCap, BookOpen, Settings, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useRhythmGameStore, RANK_TIERS } from "@/store/useRhythmGameStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useT, LOCALES } from "@/lib/i18n";
import type { AppMode } from "@/store/useAppModeStore";

interface ModeCard {
  mode: AppMode;
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
  difficultyKey: string;
  borderColor: string;
}

const MODES: ModeCard[] = [
  {
    mode: "free",
    icon: <Piano className="h-8 w-8" />,
    titleKey: "home.free_title",
    descKey: "home.free_desc",
    difficultyKey: "home.free_diff",
    borderColor: "border-left/30 hover:border-left/60",
  },
  {
    mode: "random-practice",
    icon: <GraduationCap className="h-8 w-8" />,
    titleKey: "home.random_title",
    descKey: "home.random_desc",
    difficultyKey: "home.random_diff",
    borderColor: "border-accent/30 hover:border-accent/60",
  },
  {
    mode: "score-practice",
    icon: <BookOpen className="h-8 w-8" />,
    titleKey: "home.score_title",
    descKey: "home.score_desc",
    difficultyKey: "home.score_diff",
    borderColor: "border-right/30 hover:border-right/60",
  },
];

export function HomePage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useT();
  const setMode = useAppModeStore((s) => s.setMode);
  const totalPoints = useRhythmGameStore((s) => s.totalPoints);
  const rankTier = useRhythmGameStore((s) => s.rankTier);
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);

  const currentRank = RANK_TIERS.find((r) => r.tier === rankTier);
  const nextIdx = RANK_TIERS.findIndex((r) => r.tier === rankTier) + 1;
  const nextRank = nextIdx < RANK_TIERS.length ? RANK_TIERS[nextIdx] : null;
  const progressToNext = nextRank
    ? ((totalPoints - (currentRank?.threshold ?? 0)) / (nextRank.threshold - (currentRank?.threshold ?? 0))) * 100
    : 100;

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between border-b border-bg-2 px-6 py-4">
        <div className="flex items-center gap-3">
          <Music className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-bold text-accent">{t("home.app_title")}</h1>
          <span className="text-xs text-muted">{t("home.app_subtitle")}</span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-xs text-fg"
          >
            {LOCALES.map((opt) => (
              <option key={opt.code} value={opt.code}>{opt.nativeName}</option>
            ))}
          </select>
          <Button variant="ghost" size="icon" onClick={onOpenSettings} title={t("header.settings_tip")}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <div className="flex items-center gap-4 rounded-lg border border-bg-2 bg-bg-1 px-5 py-3">
          <Trophy className="h-5 w-5 text-accent" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-fg">
              {t("home.rank")}: {currentRank?.label ?? "Beginner"}
            </span>
            <span className="text-xs text-muted">
              {t("home.total_points")}: {totalPoints.toLocaleString()}
            </span>
          </div>
          {nextRank && (
            <div className="ml-4 flex flex-col">
              <span className="text-xs text-muted">{t("home.next_rank")}: {nextRank.label}</span>
              <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-bg-3">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: Math.min(100, progressToNext) + "%" }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6" style={{ maxWidth: 720 }}>
          {MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => setMode(m.mode)}
              className={"group flex flex-col items-center gap-3 rounded-lg border-2 bg-bg-1 px-6 py-8 text-center transition-all hover:scale-[1.02] active:scale-[0.98] " + m.borderColor}
            >
              <div className="text-muted transition-colors group-hover:text-fg">
                {m.icon}
              </div>
              <h2 className="text-sm font-semibold text-fg">{t(m.titleKey)}</h2>
              <p className="text-xs text-muted leading-relaxed">{t(m.descKey)}</p>
              <span className="mt-1 rounded-full bg-bg-2 px-2 py-0.5 text-[10px] text-muted">
                {t(m.difficultyKey)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <footer className="border-t border-bg-2 px-6 py-2 text-center text-xs text-muted">
        {t("home.footer")}
      </footer>
    </div>
  );
}

// HomePage: app entry with mode cards + version footer.

import { useEffect } from "react";
import { Music, Piano, GraduationCap, BookOpen, Settings, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useUpdaterStore } from "@/store/useUpdaterStore";
import { UpdateDialog } from "@/components/UpdateDialog";
import { VersionFooter } from "@/components/VersionFooter";
import { useT, LOCALES } from "@/lib/i18n";
import type { AppMode } from "@/store/useAppModeStore";

interface ModeCard {
  mode: AppMode;
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
  difficultyKey: string;
  cardClass: string;    // base card: bg + border + hover border
  tintClass: string;    // static color wash (always visible)
  glowClass: string;    // hover gradient wash
  iconBgClass: string;  // icon badge bg + ring
  iconClass: string;    // icon color
  titleClass: string;   // title color
  badgeClass: string;   // difficulty badge bg + text
}

// Each mode carries a distinct color identity so the four cards
// feel visually independent while staying within the dark theme.
const MODES: ModeCard[] = [
  {
    mode: "free",
    icon: <Piano className="h-7 w-7" />,
    titleKey: "home.free_title",
    descKey: "home.free_desc",
    difficultyKey: "home.free_diff",
    cardClass: "border-cyan-500/40 bg-bg-1 hover:border-cyan-300/80",
    tintClass: "bg-gradient-to-b from-cyan-500/15 via-cyan-500/5 to-transparent",
    glowClass: "bg-gradient-to-b from-cyan-500/25 to-transparent",
    iconBgClass: "bg-cyan-500/20 ring-cyan-400/40",
    iconClass: "text-cyan-300",
    titleClass: "text-cyan-200",
    badgeClass: "bg-cyan-500/15 text-cyan-200",
  },
  {
    mode: "random-practice",
    icon: <GraduationCap className="h-7 w-7" />,
    titleKey: "home.random_title",
    descKey: "home.random_desc",
    difficultyKey: "home.random_diff",
    cardClass: "border-amber-500/40 bg-bg-1 hover:border-amber-300/80",
    tintClass: "bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent",
    glowClass: "bg-gradient-to-b from-amber-500/25 to-transparent",
    iconBgClass: "bg-amber-500/20 ring-amber-400/40",
    iconClass: "text-amber-300",
    titleClass: "text-amber-200",
    badgeClass: "bg-amber-500/15 text-amber-200",
  },
  {
    mode: "score-practice",
    icon: <BookOpen className="h-7 w-7" />,
    titleKey: "home.score_title",
    descKey: "home.score_desc",
    difficultyKey: "home.score_diff",
    cardClass: "border-violet-500/40 bg-bg-1 hover:border-violet-300/80",
    tintClass: "bg-gradient-to-b from-violet-500/15 via-violet-500/5 to-transparent",
    glowClass: "bg-gradient-to-b from-violet-500/25 to-transparent",
    iconBgClass: "bg-violet-500/20 ring-violet-400/40",
    iconClass: "text-violet-300",
    titleClass: "text-violet-200",
    badgeClass: "bg-violet-500/15 text-violet-200",
  },
  {
    mode: "note-reading",
    icon: <Music2 className="h-7 w-7" />,
    titleKey: "home.reading_title",
    descKey: "home.reading_desc",
    difficultyKey: "home.reading_diff",
    cardClass: "border-emerald-500/40 bg-bg-1 hover:border-emerald-300/80",
    tintClass: "bg-gradient-to-b from-emerald-500/15 via-emerald-500/5 to-transparent",
    glowClass: "bg-gradient-to-b from-emerald-500/25 to-transparent",
    iconBgClass: "bg-emerald-500/20 ring-emerald-400/40",
    iconClass: "text-emerald-300",
    titleClass: "text-emerald-200",
    badgeClass: "bg-emerald-500/15 text-emerald-200",
  },
];

export function HomePage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useT();
  const setMode = useAppModeStore((s) => s.setMode);
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);

  // --- Update check on mount ---
  const checkUpdate = useUpdaterStore((s) => s.check);
  useEffect(() => { checkUpdate(); }, [checkUpdate]);

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
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4" style={{ maxWidth: 940 }}>
          {MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => setMode(m.mode)}
              className={"group relative flex flex-col items-center gap-3 overflow-hidden rounded-xl border px-6 py-8 text-center transition-all hover:scale-[1.03] active:scale-[0.98] " + m.cardClass}
            >
              {/* static color wash so each card reads its own hue at rest */}
              <div className={"pointer-events-none absolute inset-0 " + m.tintClass} />
              {/* stronger gradient glow on hover */}
              <div className={"pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 " + m.glowClass} />
              <div className={"mb-1 flex h-14 w-14 items-center justify-center rounded-full ring-1 " + m.iconBgClass}>
                <span className={m.iconClass}>{m.icon}</span>
              </div>
              <h2 className={"text-sm font-bold " + m.titleClass}>{t(m.titleKey)}</h2>
              <p className="text-xs text-muted leading-relaxed">{t(m.descKey)}</p>
              <span className={"mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium " + m.badgeClass}>
                {t(m.difficultyKey)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-bg-2 px-6 py-2">
        <span className="text-xs text-muted">{t("home.footer")}</span>
        <VersionFooter />
      </footer>

      {/* Update dialog */}
      <UpdateDialog />
    </div>
  );
}

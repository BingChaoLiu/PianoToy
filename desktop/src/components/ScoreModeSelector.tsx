// ScoreModeSelector: lets user pick Practice vs Challenge mode before starting score practice.

import { useState } from "react";
import { BookOpen, Swords, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useScorePracticeStore, type ScorePracticeMode } from "@/store/useScorePracticeStore";

interface Props {
  onModeSelected: (mode: ScorePracticeMode) => void;
}

export function ScoreModeSelector({ onModeSelected }: Props) {
  const t = useT();
  const savedMode = useScorePracticeStore((s) => s.mode);
  const setSavedMode = useScorePracticeStore((s) => s.setMode);
  const [selected, setSelected] = useState<ScorePracticeMode>(savedMode);

  const handleStart = () => {
    setSavedMode(selected);
    onModeSelected(selected);
  };

  const modes: { value: ScorePracticeMode; icon: React.ReactNode; labelKey: string; descKey: string }[] = [
    { value: "practice", icon: <BookOpen className="h-6 w-6" />, labelKey: "score_mode.practice", descKey: "score_mode.practice_desc" },
    { value: "challenge", icon: <Swords className="h-6 w-6" />, labelKey: "score_mode.challenge", descKey: "score_mode.challenge_desc" },
  ];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6">
      <h2 className="text-lg font-bold text-fg">{t("score_mode.select_mode")}</h2>
      <div className="flex gap-4">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => setSelected(m.value)}
            className={
              "flex flex-col items-center gap-3 rounded-lg border-2 px-8 py-6 transition-all " +
              (selected === m.value
                ? "border-accent bg-accent/10"
                : "border-bg-2 bg-bg-1 hover:border-accent/30")
            }
          >
            <div className={selected === m.value ? "text-accent" : "text-muted"}>
              {m.icon}
            </div>
            <span className={"text-sm font-semibold " + (selected === m.value ? "text-accent" : "text-fg")}>
              {t(m.labelKey)}
            </span>
            <span className="text-xs text-muted">{t(m.descKey)}</span>
          </button>
        ))}
      </div>
      <Button variant="default" size="lg" onClick={handleStart}>
        <Play className="mr-2 h-4 w-4" />
        {t("score_mode.start")}
      </Button>
    </div>
  );
}

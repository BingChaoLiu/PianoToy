// NoteReadingSummary: exit summary for the note-reading trainer.

import { Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNoteReadingStore } from "@/store/useNoteReadingStore";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useInputStore } from "@/store/useInputStore";
import { useT } from "@/lib/i18n";
import { formatTime } from "@/lib/note-utils";

export function NoteReadingSummary({ onClose }: { onClose: () => void }) {
  const t = useT();
  const setMode = useAppModeStore((s) => s.setMode);
  const correct = useNoteReadingStore((s) => s.correctCount);
  const wrong = useNoteReadingStore((s) => s.wrongCount);
  const bestStreak = useNoteReadingStore((s) => s.bestStreak);
  const total = correct + wrong;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const startTime = useNoteReadingStore((s) => s.startTime);
  const elapsed = startTime ? (performance.now() - startTime) / 1000 : 0;

  const handleHome = () => {
    onClose();
    useInputStore.getState().clear();
    setMode("home");
  };

  const handleContinue = () => {
    onClose();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-0/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-lg border border-bg-2 bg-bg-1 p-6 shadow-xl">
        <h2 className="mb-4 text-center text-lg font-bold text-fg">{t("reading.summary_title")}</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("reading.correct")}</div>
            <div className="text-sm font-semibold text-accent">{correct}</div>
          </div>
          <div className="rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("reading.wrong")}</div>
            <div className="text-sm font-semibold text-fg">{wrong}</div>
          </div>
          <div className="rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("reading.best_streak")}</div>
            <div className="text-sm font-semibold text-fg">{bestStreak}</div>
          </div>
          <div className="rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("stats.accuracy")}</div>
            <div className="text-sm font-semibold text-fg">{accuracy}%</div>
          </div>
          <div className="col-span-2 rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("result.time")}</div>
            <div className="text-sm font-semibold text-fg">{formatTime(elapsed)}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="default" size="sm" className="flex-1" onClick={handleContinue}>
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("reading.continue")}
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

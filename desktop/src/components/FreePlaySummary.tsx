// FreePlaySummary: shown when user exits free play mode.

import { X, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FreePlayStats } from "@/store/useFreePlayStore";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useInputStore } from "@/store/useInputStore";
import { useT } from "@/lib/i18n";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + octave;
}

export function FreePlaySummary({ stats, onClose }: { stats: FreePlayStats; onClose: () => void }) {
  const t = useT();
  const setMode = useAppModeStore((s) => s.setMode);
  const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const range = stats.keyPresses > 0
    ? midiToName(stats.lowestMidi) + " - " + midiToName(stats.highestMidi)
    : "-";

  const handleHome = () => {
    onClose();
    useInputStore.getState().clear();
    setMode("home");
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg-0/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-lg border border-bg-2 bg-bg-1 p-6 shadow-xl">
        <Button variant="ghost" size="icon" className="absolute right-3 top-3" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
        <h2 className="mb-4 text-center text-lg font-bold text-fg">{t("free.summary_title")}</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("free.duration")}</div>
            <div className="text-sm font-semibold text-fg">{minutes}:{String(seconds).padStart(2, "0")}</div>
          </div>
          <div className="rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("free.key_presses")}</div>
            <div className="text-sm font-semibold text-accent">{stats.keyPresses}</div>
          </div>
          <div className="col-span-2 rounded bg-bg-2 px-3 py-2">
            <div className="text-[10px] text-muted">{t("free.note_range")}</div>
            <div className="text-sm font-semibold text-fg">{range}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="default" size="sm" className="flex-1" onClick={onClose}>
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("free.continue")}
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

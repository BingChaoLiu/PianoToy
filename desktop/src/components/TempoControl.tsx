// TempoControl: compact tempo slider for practice modes.

import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useT } from "@/lib/i18n";

export function TempoControl() {
  const t = useT();
  const tempoScale = usePlaybackStore((s) => s.tempoScale);
  const setTempoScale = usePlaybackStore((s) => s.setTempoScale);
  const tempoPct = Math.round(tempoScale * 100);

  return (
    <div className="flex items-center gap-1">
      <label className="text-[10px] text-muted">{t("transport.tempo")}</label>
      <input
        type="range"
        min={25}
        max={200}
        step={5}
        value={tempoPct}
        onChange={(e) => setTempoScale(Number(e.target.value) / 100)}
        className="w-16"
      />
      <span className="w-9 text-right text-[10px] font-mono text-muted">{tempoPct}%</span>
    </div>
  );
}

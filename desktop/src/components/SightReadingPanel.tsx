// Sight-reading configuration drawer.

import { Button } from "@/components/ui/button";
import { useSightReadingStore } from "@/store/useSightReadingStore";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useT } from "@/lib/i18n";
import { buildSightReadingExercise, type Difficulty, type KeyLetter } from "@/lib/sight-reading";
import { useRhythmGameStore } from "@/store/useRhythmGameStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerate?: () => void;
}

const KEYS: KeyLetter[] = ["C", "G", "D", "A", "E", "F", "Bb", "Eb"];
const BARS = [2, 4, 8];

export function SightReadingPanel({ open, onClose, onGenerate }: Props) {
  const t = useT();
  const key = useSightReadingStore((s) => s.key);
  const octave = useSightReadingStore((s) => s.octave);
  const difficulty = useSightReadingStore((s) => s.difficulty);
  const bars = useSightReadingStore((s) => s.bars);
  const bpm = useSightReadingStore((s) => s.bpm);
  const lastSeed = useSightReadingStore((s) => s.lastSeed);
  const setKey = useSightReadingStore((s) => s.setKey);
  const setOctave = useSightReadingStore((s) => s.setOctave);
  const setDifficulty = useSightReadingStore((s) => s.setDifficulty);
  const setBars = useSightReadingStore((s) => s.setBars);
  const setBpm = useSightReadingStore((s) => s.setBpm);
  const setLastSeed = useSightReadingStore((s) => s.setLastSeed);

  const loadSong = useSongStore((s) => s.loadSong);
  const play = usePlaybackStore((s) => s.play);

  const generate = (useSeed?: number) => {
    const beatSec = 60 / bpm;
    const { song, seed } = buildSightReadingExercise({
      key, octave, bars, beatSec, difficulty,
      seed: useSeed,
    });
    loadSong(song);
    setLastSeed(seed);
    usePracticeStore.getState().setEnabled(true);
    usePracticeStore.getState().resetForSong(song);
    useRhythmGameStore.getState().startSession();
    // If parent handles countdown, notify it; otherwise play directly
    if (onGenerate) {
      onGenerate();
    } else {
      requestAnimationFrame(() => play(song));
    }
  };

  const redo = () => {
    if (lastSeed != null) generate(lastSeed);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  const difficulties: { v: Difficulty; label: string }[] = [
    { v: "beginner", label: t("difficulties.beginner") },
    { v: "intermediate", label: t("difficulties.intermediate") },
    { v: "advanced", label: t("difficulties.advanced") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="flex w-[min(92vw,360px)] max-h-[85vh] flex-col rounded-xl border border-bg-3 bg-bg-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-bg-2 px-4 py-3">
        <h2 className="text-sm font-semibold">{t("sight.title")}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>{t("sight.close")}</Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        <Field label={t("sight.key")}>
          <select
            value={key}
            onChange={(e) => setKey(e.target.value as KeyLetter)}
            className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-xs"
          >
            {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>

        <Field label={t("sight.octave")}>
          <select
            value={octave}
            onChange={(e) => setOctave(Number(e.target.value))}
            className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-xs"
          >
            <option value={3}>oct 3 ({t("sight.octave_short_low")})</option>
            <option value={4}>oct 4</option>
            <option value={5}>oct 5 ({t("sight.octave_short_high")})</option>
          </select>
        </Field>

        <Field label={t("sight.difficulty")}>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-xs"
          >
            {difficulties.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
          </select>
        </Field>

        <Field label={t("sight.bars")}>
          <select
            value={bars}
            onChange={(e) => setBars(Number(e.target.value))}
            className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-xs"
          >
            {BARS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>

        <Field label={t("sight.bpm", { bpm })}>
          <input
            type="range"
            min={40} max={160} step={5}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-24"
          />
        </Field>

        {lastSeed != null && (
          <div className="rounded bg-bg-2 px-2 py-1 text-xs text-muted">
            {t("sight.seed_label", { seed: lastSeed })}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="default" size="sm" className="flex-1" onClick={() => generate()}>
            {t("sight.generate")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={redo}
            disabled={lastSeed == null}
            title={t("sight.redo_tip")}
          >
            {t("sight.redo")}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}

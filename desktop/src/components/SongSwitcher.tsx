// SongSwitcher: dropdown/drawer to switch songs during score practice.

import { X, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { SCORE_CATALOG } from "@/lib/songs/catalog";
import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";
import { useSongStore } from "@/store/useSongStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useRhythmGameStore } from "@/store/useRhythmGameStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { parseSmf } from "@/lib/smf-parser";
import { loadMidi } from "@/lib/midi-storage";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onSongSwitched: () => void;
}

export function SongSwitcher({ open, onClose, onSongSwitched }: Props) {
  const t = useT();
  const { customScores } = useScoreLibraryStore();
  const currentSong = useSongStore((s) => s.song);

  const allScores = [...SCORE_CATALOG, ...customScores];

  const handleSelect = async (entry: typeof SCORE_CATALOG[number]) => {
    let song;
    if (entry.build) {
      song = entry.build();
    } else if (entry.filePath) {
      try {
        const resp = await fetch(entry.filePath);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const ab = await resp.arrayBuffer();
        const bytes = new Uint8Array(ab);
        song = parseSmf(bytes);
        song.name = entry.name;
      } catch (err) {
        toast.error(t("toast.load_failed", { msg: String(err) }));
        return;
      }
    } else {
      // Custom imported MIDI: load raw bytes from storage
      try {
        const bytes = await loadMidi(entry.id);
        if (!bytes) {
          toast.error(t("toast.load_failed", { msg: "file not found" }));
          return;
        }
        song = parseSmf(bytes);
        song.name = entry.name;
      } catch (err) {
        toast.error(t("toast.load_failed", { msg: String(err) }));
        return;
      }
    }
    if (!song) return;

    // Reset all practice state
    usePlaybackStore.getState().pause();
    usePracticeStore.getState().setEnabled(false);
    usePracticeStore.getState().resetStats();
    useRhythmGameStore.getState().resetSession();

    // Load new song
    useSongStore.getState().loadSong(song);

    onClose();
    onSongSwitched();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="flex w-[min(92vw,360px)] max-h-[85vh] flex-col rounded-xl border border-bg-3 bg-bg-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-bg-2 px-4 py-3">
        <h2 className="text-sm font-semibold">{t("song_switcher.title")}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {allScores.map((entry) => {
          const isCurrent = currentSong?.name === entry.name;
          return (
            <button
              key={entry.id}
              onClick={() => handleSelect(entry)}
              disabled={isCurrent}
              className={
                "mb-2 flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs transition-colors " +
                (isCurrent
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-bg-2 bg-bg-2 text-fg hover:border-accent/30")
              }
            >
              <Music className="h-3 w-3 shrink-0 text-muted" />
              <div className="flex-1 overflow-hidden">
                <div className="truncate font-medium">{entry.name}</div>
                <div className="text-muted">{entry.composer}</div>
              </div>
              {isCurrent && (
                <span className="shrink-0 text-[10px] text-accent">{t("song_switcher.current")}</span>
              )}
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

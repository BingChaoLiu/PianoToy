// Floating song badge: name, note count, duration, unload button.

import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSongStore } from "@/store/useSongStore";
import { useT } from "@/lib/i18n";
import { formatTime } from "@/lib/note-utils";

export function SongStatusBar() {
  const t = useT();
  const song = useSongStore((s) => s.song);
  const unload = useSongStore((s) => s.unload);

  const stats = useMemo(() => {
    if (!song) return null;
    return {
      notes: song.notes.length,
      duration: formatTime(song.duration),
    };
  }, [song]);

  if (!song || !stats) return null;

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-10 flex items-center gap-3 rounded-md border border-bg-2 bg-bg-1/95 px-3 py-2 text-xs backdrop-blur">
      <span className="font-medium text-accent">{song.name}</span>
      <span className="text-muted">{t("song.notes_count", { n: stats.notes })}</span>
      <span className="text-muted">{stats.duration}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        onClick={unload}
        title={t("song.unload_tip")}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

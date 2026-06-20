// Playback transport: play/pause, scrub, tempo, loop, AB.

import { useEffect, useState } from "react";
import { Play, Pause, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useT } from "@/lib/i18n";
import { formatTime } from "@/lib/note-utils";

export function Transport() {
  const t = useT();
  const song = useSongStore((s) => s.song);
  const unload = useSongStore((s) => s.unload);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const tempoScale = usePlaybackStore((s) => s.tempoScale);
  const loop = usePlaybackStore((s) => s.loop);
  const abLoop = usePlaybackStore((s) => s.abLoop);
  const play = usePlaybackStore((s) => s.play);
  const pause = usePlaybackStore((s) => s.pause);
  const seek = usePlaybackStore((s) => s.seek);
  const setTempoScale = usePlaybackStore((s) => s.setTempoScale);
  const setLoop = usePlaybackStore((s) => s.setLoop);
  const setAbLoop = usePlaybackStore((s) => s.setAbLoop);
  const currentSongTime = usePlaybackStore((s) => s.currentSongTime);

  const [tickT, setTickT] = useState(0);

  useEffect(() => {
    if (!song || !isPlaying) return;
    const id = window.setInterval(() => {
      setTickT(currentSongTime(song));
    }, 100);
    return () => window.clearInterval(id);
  }, [song, isPlaying, currentSongTime]);

  if (!song) return null;

  const displayT = isPlaying ? tickT : usePlaybackStore.getState().playStartSongT;

  const handlePlay = () => {
    if (isPlaying) pause();
    else play(song);
  };

  const handleSeek = (val: number) => {
    const wasPlaying = usePlaybackStore.getState().isPlaying;
    seek(val, song);
    if (wasPlaying) play(song);
  };

  const setA = () => {
    const tNow = isPlaying ? tickT : usePlaybackStore.getState().playStartSongT;
    setAbLoop({ a: tNow, b: abLoop.b });
  };
  const setB = () => {
    const tNow = isPlaying ? tickT : usePlaybackStore.getState().playStartSongT;
    setAbLoop({ a: abLoop.a, b: tNow });
  };
  const clearAb = () => setAbLoop({ a: null, b: null });

  const tempoPct = Math.round(tempoScale * 100);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-md border border-bg-2 bg-bg-1/95 px-4 py-2 text-xs backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePlay}
        title={isPlaying ? t("transport.pause_tip") : t("transport.play_tip")}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <span className="font-mono text-muted">{formatTime(displayT)}</span>
      <input
        type="range"
        min={0}
        max={song.duration * 1000}
        step={100}
        value={displayT * 1000}
        onChange={(e) => handleSeek(Number(e.target.value) / 1000)}
        className="w-40"
      />
      <span className="font-mono text-muted">{formatTime(song.duration)}</span>

      <div className="ml-2 flex items-center gap-1">
        <label className="text-muted">{t("transport.tempo")}</label>
        <input
          type="range"
          min={25}
          max={200}
          step={5}
          value={tempoPct}
          onChange={(e) => setTempoScale(Number(e.target.value) / 100)}
          className="w-20"
        />
        <span className="w-10 font-mono text-muted">{tempoPct}%</span>
      </div>

      <Button
        variant={loop ? "default" : "ghost"}
        size="icon"
        onClick={() => setLoop(!loop)}
        title={t("transport.loop_tip")}
      >
        <Repeat className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={setA}>A{abLoop.a != null ? ` ${formatTime(abLoop.a)}` : ""}</Button>
        <Button variant="ghost" size="sm" onClick={setB}>B{abLoop.b != null ? ` ${formatTime(abLoop.b)}` : ""}</Button>
        {(abLoop.a != null || abLoop.b != null) && (
          <Button variant="ghost" size="icon" onClick={clearAb} title={t("transport.clear_ab_tip")}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={unload}>{t("transport.unload")}</Button>
    </div>
  );
}

// Overlay for manually adding/removing PDF↔MIDI anchors. Click on the PDF to
// mark a candidate y; a small popover offers "use current playback time" to
// pin that y to the current songTime. Existing anchors show as horizontal
// lines with a delete button. All edits are persisted to meta.json.

import { useCallback, useEffect, useState } from "react";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useSongStore } from "@/store/useSongStore";
import { readScoreMeta, saveScoreMeta } from "@/lib/score-storage";
import type { PdfAnchor, ScoreMeta } from "@/lib/score-storage/types";

interface Props {
  folder: string | null;
  hostRef: React.RefObject<HTMLDivElement | null>;
  scrollableHeight: number;
  /** Force PdfScoreView to re-read meta after we save. */
  onChanged: () => void;
}

export function AnchorEditorOverlay({ folder, hostRef, scrollableHeight, onChanged }: Props) {
  const song = useSongStore((s) => s.song);
  const [pending, setPending] = useState<{ y: number } | null>(null);
  const [anchors, setAnchors] = useState<PdfAnchor[]>([]);

  // Load current anchors whenever folder changes.
  useEffect(() => {
    if (!folder) {
      setAnchors([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const meta = await readScoreMeta(folder);
      if (!cancelled) setAnchors(meta?.pdfScroll?.anchors ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [folder]);

  const onHostClick = useCallback(
    (e: React.MouseEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const y = e.clientY - rect.top + host.scrollTop;
      setPending({ y });
    },
    [hostRef],
  );

  const pinWithCurrentTime = useCallback(async () => {
    if (!pending || !folder || !song) return;
    const pb = usePlaybackStore.getState();
    const songTime = pb.currentSongTime(song);
    const meta = await readScoreMeta(folder);
    if (!meta) return;
    const list = [...(meta.pdfScroll?.anchors ?? []), { songTime, pdfY: pending.y }];
    list.sort((a, b) => a.songTime - b.songTime);
    const updated: ScoreMeta = {
      ...meta,
      pdfScroll: {
        mode: "follow",
        scrollableHeight: meta.pdfScroll?.scrollableHeight ?? scrollableHeight,
        anchors: list,
      },
    };
    await saveScoreMeta(folder, updated);
    setAnchors(list);
    setPending(null);
    onChanged();
  }, [pending, folder, song, scrollableHeight, onChanged]);

  const removeAnchor = useCallback(
    async (idx: number) => {
      if (!folder) return;
      const meta = await readScoreMeta(folder);
      if (!meta?.pdfScroll) return;
      const list = meta.pdfScroll.anchors.filter((_, i) => i !== idx);
      await saveScoreMeta(folder, {
        ...meta,
        pdfScroll: { ...meta.pdfScroll, anchors: list },
      });
      setAnchors(list);
      onChanged();
    },
    [folder, onChanged],
  );

  if (!folder) return null;

  return (
    <div
      className="absolute left-0 right-0 top-0 z-10 cursor-crosshair"
      style={{ height: scrollableHeight || "100%" }}
      onClick={onHostClick}
    >
      {/* Existing anchors as full-width horizontal lines */}
      {anchors.map((a, i) => (
        <div
          key={i}
          className="pointer-events-auto absolute left-0 right-0 flex items-center"
          style={{ top: a.pdfY }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-0.5 flex-1 bg-blue-500/60" />
          <button
            className="ml-1 rounded bg-red-500/80 px-1 text-[10px] text-white hover:bg-red-500"
            onClick={() => void removeAnchor(i)}
          >
            ×
          </button>
          <span className="ml-1 rounded bg-blue-500/80 px-1 text-[10px] text-white">
            {a.songTime.toFixed(1)}s
          </span>
        </div>
      ))}
      {/* Pending candidate popover */}
      {pending && song && (
        <div
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded border border-bg-3 bg-bg-1 p-1 shadow"
          style={{ top: pending.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white hover:bg-blue-400"
            onClick={() => void pinWithCurrentTime()}
          >
            + {usePlaybackStore.getState().currentSongTime(song).toFixed(1)}s
          </button>
        </div>
      )}
    </div>
  );
}

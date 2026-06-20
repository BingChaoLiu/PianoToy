// PDF score display view: renders the imported PDF via pdf.js and scrolls it
// in sync with MIDI playback time using the score's anchors. First open
// generates coarse anchors if none exist (saved back to meta.json).
//
// This is a presentation-only view: no falling notes, no hit detection, no
// scoring. User keystrokes still sound via the synth; the listen-only toggle
// controls the demo audio as usual.

import { useEffect, useRef, useState } from "react";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";
import { loadScorePdf, readScoreMeta, saveScoreMeta } from "@/lib/score-storage";
import type { PdfAnchor, ScoreMeta } from "@/lib/score-storage/types";
import { openPdfViewer, type PdfViewerHandle } from "@/lib/pdf/pdf-viewer";
import { interpolatePdfY, generateCoarseAnchors } from "@/lib/pdf/anchor-scroll";
import { AnchorEditorOverlay } from "@/components/AnchorEditorOverlay";
import { useT } from "@/lib/i18n";

/**
 * Match the currently-loaded song back to its library entry. The song name +
 * duration pair is a good enough key for the small custom-score set.
 */
function useCurrentFolder(): string | null {
  const song = useSongStore((s) => s.song);
  return useScoreLibraryStore((s) => {
    if (!song) return null;
    return (
      s.customScores.find(
        (e) => e.name === song.name && Math.abs(e.duration - song.duration) < 1.5,
      )?.id ?? null
    );
  });
}

export function PdfScoreView() {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PdfViewerHandle | null>(null);
  // Cached anchors + meta version, refreshed on open and after anchor edits.
  const anchorsRef = useRef<PdfAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPdf, setHasPdf] = useState(true);
  const [editing, setEditing] = useState(false);
  // Bumped to force a meta re-read after the editor saves anchors.
  const [metaTick, setMetaTick] = useState(0);

  const song = useSongStore((s) => s.song);
  const currentFolder = useCurrentFolder();

  // Open the PDF once the folder is known.
  useEffect(() => {
    let destroyed = false;
    const host = hostRef.current;
    if (!host || !currentFolder) {
      setHasPdf(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setHasPdf(true);

    (async () => {
      try {
        const bytes = await loadScorePdf(currentFolder);
        if (!bytes || bytes.length === 0) {
          if (!destroyed) {
            setHasPdf(false);
            setLoading(false);
          }
          return;
        }
        const width = host.clientWidth || 800;
        const handle = await openPdfViewer(bytes, host, width);
        if (destroyed) {
          handle.destroy();
          return;
        }
        viewerRef.current = handle;

        // Ensure anchors exist; generate coarse ones on first open.
        const meta = await readScoreMeta(currentFolder);
        if (meta && song && (!meta.pdfScroll || meta.pdfScroll.anchors.length === 0)) {
          const anchors = generateCoarseAnchors({
            duration: song.duration,
            pageCount: handle.pageCount,
            pageHeight: handle.pageHeight,
          });
          const updated: ScoreMeta = {
            ...meta,
            pdfScroll: {
              mode: "follow",
              scrollableHeight: handle.scrollableHeight,
              anchors,
            },
          };
          await saveScoreMeta(currentFolder, updated);
          anchorsRef.current = anchors;
        } else if (meta?.pdfScroll) {
          anchorsRef.current = meta.pdfScroll.anchors;
        }
        if (!destroyed) setLoading(false);
      } catch (err) {
        console.error("[PdfScoreView] open failed", err);
        if (!destroyed) {
          setHasPdf(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      destroyed = true;
      // Release the previous handle before a re-open (prevents doc/Blob leak).
      viewerRef.current?.destroy();
      viewerRef.current = null;
      anchorsRef.current = [];
    };
  }, [currentFolder, song?.name, song?.duration]);

  // Re-read anchors after the editor saves (metaTick bump).
  useEffect(() => {
    if (!currentFolder) return;
    let cancelled = false;
    (async () => {
      const meta = await readScoreMeta(currentFolder);
      if (!cancelled && meta?.pdfScroll) {
        anchorsRef.current = meta.pdfScroll.anchors;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentFolder, metaTick]);

  // RAF loop: scroll PDF to the interpolated y for the current song time.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const viewer = viewerRef.current;
      if (viewer && song) {
        const pb = usePlaybackStore.getState();
        const songT = pb.currentSongTime(song);
        const y = interpolatePdfY(songT, anchorsRef.current);
        viewer.scrollToY(y);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [song]);

  if (!hasPdf) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted">
        {t("pdf_view.no_pdf")}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg-0">
      <div className="absolute right-2 top-2 z-20">
        <button
          className={
            "rounded px-2 py-1 text-xs transition-colors " +
            (editing ? "bg-blue-500 text-white" : "bg-bg-2 text-muted hover:text-fg")
          }
          onClick={() => setEditing((v) => !v)}
        >
          {t("pdf_view.edit_anchors")}
        </button>
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          {t("pdf_view.loading")}
        </div>
      )}
      <div ref={hostRef} className="relative h-full w-full overflow-y-auto">
        {editing && (
          <AnchorEditorOverlay
            folder={currentFolder}
            hostRef={hostRef}
            pageHeight={viewerRef.current?.pageHeight ?? 0}
            scrollableHeight={viewerRef.current?.scrollableHeight ?? 0}
            onChanged={() => setMetaTick((v) => v + 1)}
          />
        )}
      </div>
    </div>
  );
}

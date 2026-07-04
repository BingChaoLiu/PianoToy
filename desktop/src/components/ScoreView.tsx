// ScoreView: Verovio-rendered sheet music overlay. Loads the current score's
// MusicXML, renders every page as inline SVG, then runs a RAF loop that
// highlights the currently-sounding notes and auto-scrolls to keep them in view.
//
// Playback sync: renderToTimemap() times are in ms at the score's default
// tempo. usePlaybackStore.currentSongTime() already folds tempoScale into its
// elapsed computation, so the returned songT is already the un-scaled score
// time in seconds — multiply by 1000 to compare against the timemap. Do NOT
// divide by tempoScale (that double-applies it).

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";
import { useScoreViewStore } from "@/store/useScoreViewStore";
import { useT } from "@/lib/i18n";
import { loadScoreMusicXml } from "@/lib/score-storage";
import { loadScoreIntoVerovio, findActiveNoteIds, destroyVerovio, type VerovioScore } from "@/lib/verovio-engine";
import { VEROVIO_DARK_THEME_CSS } from "@/lib/verovio-dark-theme";
import { ArrowLeft } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

// Throttle auto-scroll so smooth-scroll doesn't fight itself every frame.
const SCROLL_THROTTLE_MS = 250;

export function ScoreView() {
  const t = useT();
  const song = useSongStore((s) => s.song);
  const setViewMode = useScoreViewStore((s) => s.setMode);

  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The rendered score + the set of note ids currently highlighted, kept in
  // refs so the RAF loop can read/write them without re-rendering React.
  const scoreRef = useRef<VerovioScore | null>(null);
  const highlightedRef = useRef<Set<string>>(new Set());
  const lastScrollRef = useRef<number>(0);

  // Find the ScoreEntry matching the loaded song so we know which folder to
  // read score.musicxml from. Mirrors App.tsx's name+duration match.
  const customScores = useScoreLibraryStore((s) => s.customScores);

  // Inject the Verovio dark-theme CSS once. Lives in a TS constant (not
  // globals.css) so the !important specificity contract is unit-testable;
  // Vitest stubs `.css?raw` imports to empty, which defeated a real-file test.
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-verovio-theme", "");
    style.textContent = VEROVIO_DARK_THEME_CSS;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setErrorMsg("");
    scoreRef.current = null;
    highlightedRef.current = new Set();

    (async () => {
      if (!song) {
        setState("error");
        setErrorMsg("no_song");
        return;
      }
      // Resolve the folder id for the current song.
      const entry = customScores.find(
        (e) => e.name === song.name && Math.abs(e.duration - song.duration) < 1.5,
      );
      if (!entry) {
        setState("error");
        setErrorMsg("no_score");
        return;
      }
      try {
        const bytes = await loadScoreMusicXml(entry.id);
        if (!bytes || bytes.length === 0) {
          setState("error");
          setErrorMsg("no_score");
          return;
        }
        // Defensive: loadScoreMusicXml is typed Uint8Array, but a Tauri invoke
        // can leak a number[] through — coerce so TextDecoder.decode is safe.
        const u8 = bytes instanceof Uint8Array
          ? bytes
          : Array.isArray(bytes)
            ? new Uint8Array(bytes)
            : new Uint8Array(bytes as ArrayBuffer);
        const xml = new TextDecoder().decode(u8);
        const rendered = await loadScoreIntoVerovio(xml);
        if (cancelled) return;
        if (rendered.svgPages.length === 0) {
          setState("error");
          setErrorMsg("render_failed");
          return;
        }
        scoreRef.current = rendered;
        // Inject the SVG pages into the container.
        const host = containerRef.current;
        if (host) {
          host.innerHTML = rendered.svgPages.join("\n");
        }
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[ScoreView] load failed", err);
        setErrorMsg("load_failed");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      // Clear highlights + tear down the toolkit so the next score loads fresh.
      highlightedRef.current = new Set();
      destroyVerovio();
    };
  }, [song, customScores]);

  // RAF highlight loop. Runs only once ready.
  useEffect(() => {
    if (state !== "ready") return;
    let raf = 0;

    // Look up a note element by its Verovio xml:id within the rendered SVG.
    const noteEl = (id: string): Element | null => {
      const host = containerRef.current;
      if (!host) return null;
      return host.querySelector('[id="' + cssEscape(id) + '"]');
    };

    const clearHighlight = () => {
      const prev = highlightedRef.current;
      if (prev.size === 0) return;
      for (const id of prev) {
        noteEl(id)?.classList.remove("vrv-playing");
      }
      prev.clear();
    };

    const applyHighlight = (ids: string[]) => {
      const next = new Set(ids);
      // Remove ids no longer active.
      for (const id of highlightedRef.current) {
        if (!next.has(id)) {
          noteEl(id)?.classList.remove("vrv-playing");
          highlightedRef.current.delete(id);
        }
      }
      // Add newly-active ids.
      for (const id of ids) {
        if (!highlightedRef.current.has(id)) {
          noteEl(id)?.classList.add("vrv-playing");
          highlightedRef.current.add(id);
        }
      }
    };

    const loop = () => {
      const rendered = scoreRef.current;
      const currentSong = useSongStore.getState().song;
      if (rendered && currentSong) {
        const pb = usePlaybackStore.getState();
        // currentSongTime already includes tempoScale folding; *1000 → ms.
        const songT = pb.currentSongTime(currentSong);
        const timemapMs = Math.max(0, songT) * 1000;
        const ids = findActiveNoteIds(timemapMs, rendered);
        applyHighlight(ids);

        // Auto-scroll: keep the first highlighted element centered, throttled.
        const now = performance.now();
        if (ids.length > 0 && now - lastScrollRef.current > SCROLL_THROTTLE_MS) {
          const el = noteEl(ids[0]);
          if (el) {
            const host = containerRef.current;
            if (host) {
              const rect = el.getBoundingClientRect();
              const viewRect = host.getBoundingClientRect();
              const margin = viewRect.height * 0.3;
              // Only scroll when the active note is out of the central band;
              // avoids re-centering jumps every frame when already visible.
              if (rect.top < viewRect.top + margin || rect.bottom > viewRect.bottom - margin) {
                el.scrollIntoView({ block: "center", behavior: "smooth" });
                lastScrollRef.current = now;
              }
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      clearHighlight();
    };
  }, [state]);

  // IMPORTANT: the container div (with containerRef) must render in EVERY state,
  // not just "ready". The load effect runs while state is still "loading" and
  // assigns host.innerHTML there — if the container only mounts in the "ready"
  // branch, containerRef.current is null at injection time and the SVG is
  // silently dropped, leaving a blank screen behind the (later-removed) loading
  // overlay. Loading/error UI are absolutely-positioned overlays on top.
  return (
    <div className="relative h-full w-full overflow-auto bg-bg-0 score-view-host">
      {/* Always-mounted container; SVG is injected here once Verovio finishes. */}
      <div ref={containerRef} className="mx-auto w-full max-w-4xl p-4" />

      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-0/80 text-sm text-muted">
          {t("score_view.loading")}
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-0/90 text-center">
          <p className="text-sm text-muted">{t("score_view.load_failed")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("waterfall")}
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            {t("score_view.back_to_waterfall")}
          </Button>
          {errorMsg === "no_score" && (
            <p className="text-xs text-muted">{t("score_view.no_score")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** CSS.escape with a fallback for older engines / quirky ids. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
}

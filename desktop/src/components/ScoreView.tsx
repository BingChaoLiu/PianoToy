// ScoreView: Verovio-rendered sheet music overlay. Loads the current score's
// MusicXML, renders every page as inline SVG, then runs a RAF loop that
// highlights the currently-sounding notes and auto-scrolls to keep the
// active system (staff line) centered.
//
// White sheet style: the host is white, Verovio's native black ink renders
// directly on it. Only the currently-playing note is forced red (#e53935).
//
// Playback sync: renderToTimemap() times are in ms at the score's default
// tempo. usePlaybackStore.currentSongTime() already folds tempoScale into its
// elapsed computation, so the returned songT is already the un-scaled score
// time in seconds — multiply by 1000 to compare against the timemap. Do NOT
// divide by tempoScale (that double-applies it).
//
// Auto-scroll: the active note is found by id, then we walk up to its
// containing Verovio system (<g class="system"> = one staff line, treble +
// bass for piano). The system is centered with scrollIntoView ONLY when the
// system changes — notes moving within the same system produce zero scroll,
// which eliminates the per-note vertical jitter that the old note-centered
// scroll caused. Fallback chain: .system → .measure → skip.

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";
import { useScoreViewStore } from "@/store/useScoreViewStore";
import { useT } from "@/lib/i18n";
import { loadScoreMusicXml } from "@/lib/score-storage";
import { loadScoreIntoVerovio, findActiveNoteIds, destroyVerovio, type VerovioScore } from "@/lib/verovio-engine";
import { VEROVIO_SCORE_THEME_CSS } from "@/lib/verovio-score-theme";
import { ArrowLeft } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

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
  // The last system element we centered on. Used to detect system changes so
  // we only scroll once per line, not every frame within a line.
  const lastSystemRef = useRef<Element | null>(null);

  // Find the ScoreEntry matching the loaded song so we know which folder to
  // read score.musicxml from. Mirrors App.tsx's name+duration match.
  const customScores = useScoreLibraryStore((s) => s.customScores);

  // Inject the Verovio score-theme CSS once. Lives in a TS constant (not
  // globals.css) so the !important specificity contract is unit-testable;
  // Vitest stubs `.css?raw` imports to empty, which defeated a real-file test.
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-verovio-theme", "");
    style.textContent = VEROVIO_SCORE_THEME_CSS;
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
    lastSystemRef.current = null;

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
      lastSystemRef.current = null;
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

    // Walk up from an element to its containing Verovio system. A Verovio
    // system is <g class="system"> — one laid-out staff line (for piano:
    // treble + bass staves together). Fallback: <g class="measure"> (finer,
    // still vertically stable), then null (caller skips the scroll).
    const systemOf = (el: Element | null): Element | null => {
      if (!el) return null;
      const sys = el.closest(".system");
      if (sys) return sys;
      return el.closest(".measure");
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

        // Auto-scroll: center the active SYSTEM, not the note. A note's
        // y-position varies with pitch within the staff, so centering the
        // note made the page jump on every onset. Centering the system
        // keeps the page still while notes move within a line, then slides
        // once when playback crosses into the next line. We scroll ONLY on
        // system change (not every frame), via the lastSystemRef sentinel.
        if (ids.length > 0) {
          const note = noteEl(ids[0]);
          const system = systemOf(note);
          if (system && system !== lastSystemRef.current) {
            system.scrollIntoView({ block: "center", behavior: "smooth" });
            lastSystemRef.current = system;
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
    <div className="score-view-host relative h-full w-full overflow-auto bg-white">
      {/* Page card: the engraved score sits in a centered narrower card with
          rounded corners + shadow, mimicking a real sheet of paper on a desk.
          Always-mounted; SVG is injected here once Verovio finishes. */}
      <div ref={containerRef} className="score-card mx-auto my-6 w-full max-w-3xl rounded-lg bg-white p-8 shadow-xl" />

      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/85 text-sm text-zinc-700">
          {t("score_view.loading")}
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 text-center">
          <p className="text-sm text-zinc-700">{t("score_view.load_failed")}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode("waterfall")}
          >
            <ArrowLeft className="mr-1 h-3 w-3" />
            {t("score_view.back_to_waterfall")}
          </Button>
          {errorMsg === "no_score" && (
            <p className="text-xs text-zinc-500">{t("score_view.no_score")}</p>
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

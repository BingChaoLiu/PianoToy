// App: root component. Routes between HomePage, ScoreLibraryPage, and the piano stage.
// Each mode gets its own tailored toolbar; no shared Header for practice modes.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Settings, Eye, ListMusic, ArrowRightLeft, Music, AlignVerticalJustifyCenter, Headphones, FileText,
} from "lucide-react";
import { Stage } from "@/components/Stage";
import { SettingsPanel } from "@/components/SettingsPanel";
import { DropOverlay } from "@/components/DropOverlay";
import { SongStatusBar } from "@/components/SongStatusBar";
import { Transport } from "@/components/Transport";
import { StatsPanel } from "@/components/StatsPanel";
import { SightReadingPanel } from "@/components/SightReadingPanel";
import { RhythmGameHUD } from "@/components/RhythmGameHUD";
import { ResultPanel } from "@/components/ResultPanel";
import { FreePlaySummary } from "@/components/FreePlaySummary";
import { HomePage } from "@/components/HomePage";
import { ScoreLibraryPage } from "@/components/ScoreLibraryPage";
import { PdfScoreView } from "@/components/PdfScoreView";
import { CountdownOverlay } from "@/components/CountdownOverlay";
import { SongSwitcher } from "@/components/SongSwitcher";
import { ScoreModeSelector } from "@/components/ScoreModeSelector";
import { useKeyboardHotkeys } from "@/lib/keyboard-hotkeys";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { useInputStore } from "@/store/useInputStore";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useRhythmGameStore } from "@/store/useRhythmGameStore";
import { useFreePlayStore } from "@/store/useFreePlayStore";
import { useScorePracticeStore, type ScorePracticeMode } from "@/store/useScorePracticeStore";
import { useScoreViewStore } from "@/store/useScoreViewStore";
import { usePlaybackModeStore } from "@/store/usePlaybackModeStore";
import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";
import { migrateIndexedDbToFs } from "@/lib/score-storage/migration";
import { stopAllSynthVoices } from "@/lib/synth";
import { resetScheduledFlags } from "@/lib/playback-scheduler";
import { parseSmf } from "@/lib/smf-parser";
import { useT } from "@/lib/i18n";
import { Header } from "@/components/Header";
import type { LoadedMidi } from "@/types/midi";
import { Button } from "@/components/ui/button";
import { TempoControl } from "@/components/TempoControl";

// Lead time (seconds) for notes to fall before the first note hits the keyboard.
// Matches CountdownOverlay's 3 beats * 600ms = 1.8s.
const COUNTDOWN_LEAD_SEC = 1.8;

export function App() {
  const t = useT();
  const mode = useAppModeStore((s) => s.mode);
  const goHome = useAppModeStore((s) => s.goHome);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sightOpen, setSightOpen] = useState(false);
  const [showFreeSummary, setShowFreeSummary] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [songSwitcherOpen, setSongSwitcherOpen] = useState(false);
  const [showScoreModeSelector, setShowScoreModeSelector] = useState(false);

  const octave = useSettingsStore((s) => s.octave);
  const setOctave = useSettingsStore((s) => s.setOctave);
  const setShowLabels = useSettingsStore((s) => s.setShowLabels);
  const octaveRef = useRef(octave);
  octaveRef.current = octave;

  const loadSong = useSongStore((s) => s.loadSong);
  const song = useSongStore((s) => s.song);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const play = usePlaybackStore((s) => s.play);
  const pause = usePlaybackStore((s) => s.pause);
  const setPractice = usePracticeStore((s) => s.setEnabled);
  const resetForSong = usePracticeStore((s) => s.resetForSong);

  const practiceEnabled = usePracticeStore((s) => s.enabled);
  const freePlayActive = useFreePlayStore((s) => s.active);
  const startFreePlay = useFreePlayStore((s) => s.startSession);
  const recordNote = useFreePlayStore((s) => s.recordNote);

  const scoreMode = useScorePracticeStore((s) => s.mode);
  const viewMode = useScoreViewStore((s) => s.mode);
  const setViewMode = useScoreViewStore((s) => s.setMode);
  const listenOnly = usePlaybackModeStore((s) => s.listenOnly);
  const setListenOnly = usePlaybackModeStore((s) => s.setListenOnly);
  const isRhythmMode = mode === "random-practice" || (mode === "score-practice" && scoreMode === "challenge");
  // Whether the currently-loaded song has an accompanying PDF (for the view toggle).
  const hasPdfCurrent = useScoreLibraryStore((s) => {
    if (!song) return false;
    return s.customScores.some(
      (e) => e.name === song.name && Math.abs(e.duration - song.duration) < 1.5 && e.hasPdf,
    );
  });

  // One-time migration (IndexedDB → filesystem) + score library scan on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateIndexedDbToFs();
      } catch (err) {
        console.error("[startup] migration failed", err);
      }
      if (cancelled) return;
      await useScoreLibraryStore.getState().rescan();
    })();
    return () => { cancelled = true; };
  }, []);

  // Fall back to waterfall view if the current song has no PDF but we're in pdf view.
  useEffect(() => {
    if (viewMode === "pdf" && !hasPdfCurrent) {
      setViewMode("waterfall");
    }
  }, [viewMode, hasPdfCurrent, setViewMode]);

  // --- Mode entry effects ---
  useEffect(() => {
    if (mode === "free" && !freePlayActive) {
      startFreePlay();
    }
  }, [mode, freePlayActive, startFreePlay]);

  useEffect(() => {
    if (mode === "random-practice" && !song) {
      setSightOpen(true);
    }
  }, [mode, song]);

  // Close sight-reading panel when leaving random-practice mode
  useEffect(() => {
    if (mode !== "random-practice") {
      setSightOpen(false);
    }
  }, [mode]);

  // Track notes for free play stats
  useEffect(() => {
    if (mode !== "free" && mode !== "random-practice" && mode !== "score-practice") return;
    const unsub = useInputStore.subscribe((state, prev) => {
      for (const [midi] of state.active) {
        if (!prev.active.has(midi)) {
          recordNote(midi);
        }
      }
    });
    return unsub;
  }, [mode, recordNote]);

  // --- End-of-song detection for rhythm game (challenge modes only) ---
  useEffect(() => {
    if (!isRhythmMode || !practiceEnabled || !song) return;
    const check = () => {
      const rg = useRhythmGameStore.getState();
      if (rg.isFinished || rg.isFailed) return;
      const pb = usePlaybackStore.getState();
      const songT = pb.currentSongTime(song);
      if (song.duration > 0 && songT >= song.duration - 0.1) {
        rg.finishSession();
      }
    };
    const id = setInterval(check, 300);
    return () => clearInterval(id);
  }, [isRhythmMode, practiceEnabled, song]);

  // --- Progress tracking for rhythm game ---
  useEffect(() => {
    if (!isRhythmMode || !practiceEnabled || !song) return;
    const track = () => {
      const rg = useRhythmGameStore.getState();
      if (rg.isFinished || rg.isFailed) return;
      const pb = usePlaybackStore.getState();
      const songT = pb.currentSongTime(song);
      rg.setProgress(Math.min(1, songT / song.duration));
    };
    const id = setInterval(track, 200);
    return () => clearInterval(id);
  }, [isRhythmMode, practiceEnabled, song]);

  // --- Start playback with negative offset so notes fall during countdown ---
  const startPracticeWithLead = useCallback(() => {
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;
    const pb = usePlaybackStore.getState();
    pb.pause();
    // Stop any residual demo audio voices so the original sound restarts in
    // sync with the notes falling again from the top.
    stopAllSynthVoices();
    // Reset note scheduling flags so every note can be re-scheduled from the
    // beginning; this keeps the original audio playback aligned with the MIDI
    // progress when the song restarts (countdown / retry / song switch).
    resetScheduledFlags(currentSong, -COUNTDOWN_LEAD_SEC);
    // Set start time to negative lead so songTime is negative during countdown;
    // notes are already visible and falling, but haven't reached the hit line yet.
    usePlaybackStore.setState({
      playStartSongT: -COUNTDOWN_LEAD_SEC,
      playStartCtx: 0,
    });
    pb.play(currentSong);
    setCountdownActive(true);
  }, []);

  // --- Countdown complete: playback already running, just hide overlay ---
  const handleCountdownComplete = useCallback(() => {
    setCountdownActive(false);
  }, []);

  // --- Score mode selection ---
  const handleScoreModeSelected = useCallback((m: ScorePracticeMode) => {
    setShowScoreModeSelector(false);
    useScorePracticeStore.getState().setMode(m);
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;

    // Challenge mode enables hit detection + scoring; practice mode does not
    usePracticeStore.getState().setEnabled(m === "challenge");
    usePracticeStore.getState().resetForSong(currentSong);
    // Entering score practice should always start with original audio off;
    // the user can opt in from the (paused) toolbar.
    usePlaybackModeStore.getState().setListenOnly(false);

    if (m === "challenge") {
      useRhythmGameStore.getState().startSession();
      usePlaybackStore.getState().setTempoScale(1.0);
    }

    startPracticeWithLead();
  }, []);

  // --- Song switcher callback ---
  const handleSongSwitched = useCallback(() => {
    const currentMode = useScorePracticeStore.getState().mode;
    const currentSong = useSongStore.getState().song;
    if (!currentSong) return;

    usePracticeStore.getState().setEnabled(currentMode === "challenge");
    usePracticeStore.getState().resetForSong(currentSong);
    // Switching songs re-enters practice; reset original audio to off.
    usePlaybackModeStore.getState().setListenOnly(false);

    if (currentMode === "challenge") {
      useRhythmGameStore.getState().startSession();
      usePlaybackStore.getState().setTempoScale(1.0);
    }

    startPracticeWithLead();
  }, []);

  const togglePractice = () => {
    if (!song) return;
    const next = !usePracticeStore.getState().enabled;
    setPractice(next);
    if (next) resetForSong(song);
  };

  useKeyboardHotkeys({
    octaveRef,
    onOctaveChange: setOctave,
    onToggleLabels: () => setShowLabels(!useSettingsStore.getState().showLabels),
    onTogglePractice: togglePractice,
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " " && song) {
        e.preventDefault();
        if (isPlaying) pause();
        else play(song);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [song, isPlaying, play, pause]);

  useEffect(() => () => stopAllSynthVoices(), []);

  const handleFile = (file: LoadedMidi) => {
    try {
      const parsed = parseSmf(file.bytes);
      parsed.name = file.name;
      parsed.source = file.bytes;
      loadSong(parsed);
      toast.success(t("toast.loaded", { name: file.name, n: parsed.notes.length }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("toast.load_failed", { msg }));
    }
  };

  const handleBack = () => {
    if (mode === "free") {
      const stats = useFreePlayStore.getState();
      if (stats.keyPresses > 0) {
        setShowFreeSummary(true);
        return;
      }
    }
    setCountdownActive(false);
    setSongSwitcherOpen(false);
    usePlaybackStore.getState().pause();
    usePracticeStore.getState().setEnabled(false);
    usePracticeStore.getState().resetStats();
    useRhythmGameStore.getState().resetSession();
    useSongStore.getState().unload();
    useInputStore.getState().clear();
    useFreePlayStore.getState().endSession();
    usePlaybackModeStore.getState().setListenOnly(false);
    if (mode === "score-practice") {
      useAppModeStore.getState().setMode("score-practice");
    } else {
      goHome();
    }
  };

  const handleFreeSummaryClose = () => {
    setShowFreeSummary(false);
    usePlaybackStore.getState().pause();
    usePracticeStore.getState().setEnabled(false);
    usePracticeStore.getState().resetStats();
    useRhythmGameStore.getState().resetSession();
    useFreePlayStore.getState().endSession();
    useSongStore.getState().unload();
    useInputStore.getState().clear();
    goHome();
  };

  // --- Render ---

  if (mode === "home") {
    return (
      <div className="relative h-full w-full">
        <HomePage onOpenSettings={() => setSettingsOpen(true)} />
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  // Score library page: show when in score-practice mode but no song loaded yet
  if (mode === "score-practice" && !song) {
    return (
      <div className="relative h-full w-full">
        <ScoreLibraryPage onSongSelected={() => setShowScoreModeSelector(true)} />
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  // Score mode selector: after song chosen, pick practice vs challenge
  if (mode === "score-practice" && song && showScoreModeSelector) {
    return (
      <div className="relative h-full w-full">
        <header className="flex items-center border-b border-bg-2 px-4 py-2">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-xs text-muted">{t("score_mode.select_mode")}</span>
          <span className="ml-2 text-sm font-medium text-fg">{song.name}</span>
        </header>
        <ScoreModeSelector onModeSelected={handleScoreModeSelected} />
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  const modeLabel =
    mode === "free" ? t("home.free_title") :
    mode === "random-practice" ? t("home.random_title") :
    t("home.score_title");

  // Determine if HUD should show for score practice
  const showHUD = practiceEnabled && (
    mode === "random-practice" ||
    (mode === "score-practice" && scoreMode === "challenge")
  );

  return (
    <div className="relative flex h-full w-full flex-col bg-bg-0 text-fg">
      {/* Mode-specific toolbar */}
      <header className="flex items-center justify-between border-b border-bg-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleBack} title={modeLabel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted">{modeLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Free mode: file load, recording, settings */}
          {mode === "free" && (
            <Header
              onOpenSettings={() => setSettingsOpen(true)}
              onFile={handleFile}
            />
          )}

          {/* Random practice: only sight-reading params + tempo + settings */}
          {mode === "random-practice" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSightOpen(true)}
                title={t("header.sight_reading_tip")}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <TempoControl />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                title={t("header.settings_tip")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Score practice: song list + view toggle + tempo + mode switch + settings */}
          {mode === "score-practice" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSongSwitcherOpen(true)}
                title={t("song_switcher.title")}
              >
                <ListMusic className="h-4 w-4" />
              </Button>
              {/* View mode toggle: waterfall / staff / pdf */}
             <div className="flex items-center rounded-md border border-bg-2 bg-bg-2 p-0.5">
               <Button
                  variant={viewMode === "waterfall" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setViewMode("waterfall")}
                  title={t("view_mode.waterfall")}
               >
                 <AlignVerticalJustifyCenter className="h-3 w-3" />
               </Button>
               <Button
                  variant={viewMode === "staff" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => setViewMode("staff")}
                  title={t("view_mode.staff")}
               >
                 <Music className="h-3 w-3" />
               </Button>
               <Button
                  variant={viewMode === "pdf" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2"
                  disabled={!hasPdfCurrent}
                  onClick={() => setViewMode("pdf")}
                  title={t("view_mode.pdf")}
               >
                 <FileText className="h-3 w-3" />
               </Button>
             </div>
             {scoreMode === "practice" && <TempoControl />}
             {/* Listen-only mode toggle: auto-play MIDI, disable keyboard input.
                 Only toggleable while paused/stopped so the original audio stays
                 in sync with the MIDI progress instead of being toggled mid-playback. */}
             <Button
               variant={listenOnly ? "default" : "ghost"}
               size="sm"
               className="h-6 px-2"
               disabled={isPlaying}
               onClick={() => setListenOnly(!listenOnly)}
               title={isPlaying ? t("listen_only.disabled_tip") : t("listen_only.label")}
             >
               <Headphones className="h-3 w-3" />
             </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                usePlaybackStore.getState().pause();
                setShowScoreModeSelector(true);
              }}
              title={t("score_mode.select_mode")}
            >
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                title={t("header.settings_tip")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <Stage />
        {viewMode === "pdf" && (
          <div className="absolute inset-0 z-10">
            <PdfScoreView />
          </div>
        )}
        {mode === "free" && <SongStatusBar />}
        {showHUD && (
          <>
            <RhythmGameHUD />
            <ResultPanel onRetry={() => startPracticeWithLead()} />
          </>
        )}
        {mode === "free" && <StatsPanel />}
        {mode === "free" && <Transport />}
        <SightReadingPanel
          open={sightOpen}
          onClose={() => setSightOpen(false)}
          onGenerate={() => {
            setSightOpen(false);
            startPracticeWithLead();
          }}
        />
        <CountdownOverlay active={countdownActive} onComplete={handleCountdownComplete} />
        <SongSwitcher open={songSwitcherOpen} onClose={() => setSongSwitcherOpen(false)} onSongSwitched={handleSongSwitched} />
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <DropOverlay onFiles={(fs) => fs.forEach(handleFile)} />
      </div>

      {showFreeSummary && (
        <FreePlaySummary
          stats={useFreePlayStore.getState()}
          onClose={handleFreeSummaryClose}
        />
      )}
    </div>
  );
}

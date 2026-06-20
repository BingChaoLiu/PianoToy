// Stage: canvas rendering with RAF loop.
// Draws grid, song notes, history trails, piano keyboard, and visual effects.

import { useEffect, useRef } from "react";
import { useInputStore } from "@/store/useInputStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { usePracticeStore } from "@/store/usePracticeStore";
import { computeLayout, type PianoLayout } from "@/lib/piano-layout";
import { drawPiano } from "@/components/Piano/PianoKeyboard";
import { drawGrid, drawSong, drawHistory } from "@/components/Piano/Waterfall";
import { schedulePlayback } from "@/lib/playback-scheduler";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useRhythmGameStore } from "@/store/useRhythmGameStore";
import { useScorePracticeStore } from "@/store/useScorePracticeStore";
import { useScoreViewStore } from "@/store/useScoreViewStore";
import { useSightReadingStore } from "@/store/useSightReadingStore";
import { useVFXStore } from "@/store/useVFXStore";
import { usePlaybackModeStore } from "@/store/usePlaybackModeStore";
import { tickEffects, renderEffects, type VisualEffectsState } from "@/lib/visual-effects";
import { drawStaffView } from "@/lib/staff-renderer";

const PX_PER_SEC = 180;

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<PianoLayout | null>(null);
  const vfxRef = useRef<VisualEffectsState | null>(null);

  // Initialize VFX state
  useEffect(() => {
    const unsub = useVFXStore.subscribe((state) => {
      vfxRef.current = state;
    });
    vfxRef.current = useVFXStore.getState();
    return unsub;
  }, []);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutRef.current = computeLayout(rect.width, rect.height);
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastTime = performance.now() / 1000;

    const loop = () => {
      const layout = layoutRef.current;
      if (layout) {
        const input = useInputStore.getState();
        const practiceStore = usePracticeStore.getState();
        const settings = useSettingsStore.getState();
        const songStore = useSongStore.getState();
        const pb = usePlaybackStore.getState();
        const song = songStore.song;
        const now = performance.now() / 1000;
        const dt = Math.min(now - lastTime, 0.05); // cap at 50ms
        lastTime = now;

        ctx.clearRect(0, 0, layout.width, layout.height);

        const pianoTop = layout.height - layout.pianoHeight;
        const waterBottom = pianoTop;

        // 1) Grid or staff background
        const viewMode = useScoreViewStore.getState().mode;
        if (viewMode === "staff") {
          // Staff view: skip grid, staff renderer draws its own background
        } else {
          drawGrid({ ctx, layout, waterBottom });
        }

        // 2) Song time
        const songT = pb.currentSongTime(song);

        // 3) End-of-song auto-stop
        if (pb.isPlaying && !pb.loop && pb.abLoop.b === null && song &&
            song.duration > 0 && songT >= song.duration) {
          usePlaybackStore.setState({
            isPlaying: false,
            playStartSongT: song.duration,
            playStartCtx: 0,
          });
        }

        // 4) Playback + missed note detection
        if (pb.isPlaying && song) {
          const mode = useAppModeStore.getState().mode;
          const listenOnly = usePlaybackModeStore.getState().listenOnly;
          // Score practice: demo (original) audio plays only when the user opts
          // in via the listen-only toggle. Other modes keep the original rule of
          // playing the demo whenever hit detection (practiceStore.enabled) is off.
          const demoAudio = mode === "score-practice" ? listenOnly : !practiceStore.enabled;
          schedulePlayback(song, pb, demoAudio, settings.synthEnabled);
        }

        if (practiceStore.enabled && song) {
          const prevMissed = practiceStore.stats.missed;
          practiceStore.tickMissed(song, songT, settings.hitWindow);
          const mode = useAppModeStore.getState().mode;
          const scoreMode = useScorePracticeStore.getState().mode;
          const isRhythm = mode === "random-practice" || (mode === "score-practice" && scoreMode === "challenge");
          if (isRhythm && practiceStore.stats.missed > prevMissed) {
            const rg = useRhythmGameStore.getState();
            const newMissCount = practiceStore.stats.missed - prevMissed;
            for (let i = 0; i < newMissCount; i++) rg.onMiss();
            // Trigger miss VFX
            useVFXStore.getState().spawnMiss();
          }
        }

        // 5+6) Song notes: waterfall or staff view
        if (viewMode === "staff") {
          // Staff notation view
          const sr = useSightReadingStore.getState();
          drawStaffView({
            ctx, layout, pianoTop,
            song, songT,
            practice: practiceStore.enabled,
            bpm: sr.bpm,
          });
        } else {
          // Waterfall (falling notes) view
          drawSong({
            ctx, layout, pianoTop, waterBottom,
            pxPerSec: PX_PER_SEC,
            song, songT,
            practice: practiceStore.enabled, colorMode: settings.colorMode,
            showLabels: settings.showLabels,
          });
          drawHistory({
            ctx, layout, waterBottom,
            pxPerSec: PX_PER_SEC, now,
            history: input.history, colorMode: settings.colorMode,
            showLabels: settings.showLabels, practice: practiceStore.enabled,
          });
        }

        // 7) Song sounding keys
        const songSounding = new Map<number, { midi: number; track?: number }>();
        if (song) {
          for (const ev of song.notes) {
            if (ev.start <= songT && songT < ev.start + ev.duration) {
              songSounding.set(ev.midi, { midi: ev.midi, track: ev.track });
            }
          }
        }

        // 8) Prune old data
        input.pruneWrongFlash(now);
        input.pruneHistory(now);

        // 9) Piano keyboard
        drawPiano({
          ctx, layout, pianoTop,
          active: input.active,
          wrongFlash: input.wrongFlash,
          songSounding,
          colorMode: settings.colorMode,
          showLabels: settings.showLabels,
        });

        // 10) Visual effects
        const vfx = vfxRef.current;
        if (vfx) {
          tickEffects(vfx, dt);
          // Check combo milestones
          const rgCombo = useRhythmGameStore.getState().combo;
          if (rgCombo !== useVFXStore.getState().lastCombo) {
            useVFXStore.getState().updateCombo(rgCombo, layout.width / 2, waterBottom / 2);
          }
          renderEffects(ctx, vfx, layout.width, layout.height);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}

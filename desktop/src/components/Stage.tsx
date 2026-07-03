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
import { useVFXStore } from "@/store/useVFXStore";
import { usePlaybackModeStore } from "@/store/usePlaybackModeStore";
import { tickEffects, renderEffects, type VisualEffectsState } from "@/lib/visual-effects";
import { FIRST_MIDI, MIDDLE_C, isBlack } from "@/lib/note-utils";
import { trackColor, pianoKeyActiveColor } from "@/lib/color";

const PX_PER_SEC = 180;

function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith("#")) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

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

        const viewMode = useScoreViewStore.getState().mode;
        const mode = useAppModeStore.getState().mode;

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

        // 4) Playback scheduling must keep running regardless of view mode.
        if (pb.isPlaying && song) {
          const mode = useAppModeStore.getState().mode;
          const listenOnly = usePlaybackModeStore.getState().listenOnly;
          // Score practice: demo (original) audio plays only when the user opts
          // in via the listen-only toggle. Other modes keep the original rule of
          // playing the demo whenever hit detection (practiceStore.enabled) is off.
          const demoAudio = mode === "score-practice" ? listenOnly : !practiceStore.enabled;
          schedulePlayback(song, pb, demoAudio, settings.synthEnabled);
        }

        // Score (Verovio) view: the engraved sheet music is rendered by the
        // <ScoreView> overlay. We still must run miss detection here so the
        // challenge-mode HUD/HP keep working, then skip all canvas drawing.
        if (viewMode === "score") {
          if (practiceStore.enabled && song) {
            const prevMissed = practiceStore.stats.missed;
            practiceStore.tickMissed(song, songT, settings.hitWindow);
            const scoreMode = useScorePracticeStore.getState().mode;
            const isRhythm = mode === "random-practice" || (mode === "score-practice" && scoreMode === "challenge");
            if (isRhythm && practiceStore.stats.missed > prevMissed) {
              const rg = useRhythmGameStore.getState();
              const newMissCount = practiceStore.stats.missed - prevMissed;
              for (let i = 0; i < newMissCount; i++) rg.onMiss();
            }
          }
          input.pruneWrongFlash(now);
          input.pruneHistory(now);
          raf = requestAnimationFrame(loop);
          return;
        }

        ctx.clearRect(0, 0, layout.width, layout.height);

        const pianoTop = layout.height - layout.pianoHeight;
        const waterBottom = pianoTop;

        // 1) Grid background
        drawGrid({ ctx, layout, waterBottom });

        if (practiceStore.enabled && song) {
          const prevMissed = practiceStore.stats.missed;
          practiceStore.tickMissed(song, songT, settings.hitWindow);
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

        // 5+6) Waterfall (falling notes) — the score view returns early above.
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
          showLabels: settings.showLabels, practice: mode !== "free",
        });

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

        // Determine active correct keys for particles & glows
        const activeCorrectKeys: Array<{ midi: number; color: string }> = [];
        const listenOnly = usePlaybackModeStore.getState().listenOnly;

        if (listenOnly) {
          // In listen-only mode, the glowing keys and particles match the song's sounding notes
          for (const [midi, info] of songSounding) {
            let color = "#4ade80"; // default green
            if (settings.colorMode === "track") {
              color = trackColor(info.track).fill;
            } else if (settings.colorMode === "split") {
              color = midi >= MIDDLE_C ? "#f5b942" : "#4dd4c0";
            }
            activeCorrectKeys.push({ midi, color });
          }
        } else if (practiceStore.enabled && song) {
          // In practice/challenge mode, the user must be pressing the key,
          // and the key must match a note in the song that is currently active (sounding).
          for (const ev of song.notes) {
            const isNow = ev.start <= songT && songT < ev.start + ev.duration;
            if (isNow && ev._matched) {
              const activeNote = input.active.get(ev.midi);
              if (activeNote && activeNote.matchResult === "hit") {
                let color = "#4ade80"; // green in practice
                if (settings.colorMode === "track") {
                  color = trackColor(ev.track).fill;
                } else if (settings.colorMode === "split") {
                  color = ev.midi >= MIDDLE_C ? "#f5b942" : "#4dd4c0";
                }
                activeCorrectKeys.push({ midi: ev.midi, color });
              }
            }
          }
        } else {
          // Free play mode: any key in input.active that is not wrong is correct
          for (const [midi, activeNote] of input.active) {
            if (activeNote.matchResult !== "wrong") {
              const color = pianoKeyActiveColor(midi, settings.colorMode);
              activeCorrectKeys.push({ midi, color });
            }
          }
        }

        // Spawn sustained particles for each active correct key
        for (const { midi, color } of activeCorrectKeys) {
          const x = layout.keyX[midi - FIRST_MIDI];
          const y = waterBottom;
          useVFXStore.getState().spawnSustained(x, y, color, dt);
        }

        // Draw glowing halos at the key contact positions
        for (const { midi, color } of activeCorrectKeys) {
          const x = layout.keyX[midi - FIRST_MIDI];
          const y = waterBottom;
          const black = isBlack(midi);
          const keyWidth = black ? layout.whiteKeyW * 0.62 : layout.whiteKeyW * 0.86;

          ctx.save();
          ctx.globalCompositeOperation = "screen";

          // Soft circular glow
          const radialGrad = ctx.createRadialGradient(x, y, 0, x, y, 36);
          radialGrad.addColorStop(0, hexToRgba(color, 0.45));
          radialGrad.addColorStop(0.4, hexToRgba(color, 0.18));
          radialGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = radialGrad;
          ctx.beginPath();
          ctx.arc(x, y, 36, 0, Math.PI * 2);
          ctx.fill();

          // Horizontal squashed neon-like flare
          ctx.translate(x, y);
          ctx.scale(1, 0.22); // squash vertically
          const flareGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, keyWidth * 1.6);
          flareGrad.addColorStop(0, "#ffffffdd"); // bright white core
          flareGrad.addColorStop(0.2, hexToRgba(color, 0.75)); // colorful outer flare
          flareGrad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = flareGrad;
          ctx.beginPath();
          ctx.arc(0, 0, keyWidth * 1.6, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }

        // 10) Visual effects
        const vfx = vfxRef.current;
        if (vfx) {
          // Process queued hit events to spawn particles at the correct key coordinate
          const hitEvents = useVFXStore.getState().hitEvents;
          if (hitEvents.length > 0) {
            for (const midi of hitEvents) {
              const x = layout.keyX[midi - FIRST_MIDI];
              const y = waterBottom;
              useVFXStore.getState().spawnHit(x, y);
            }
            useVFXStore.getState().clearHitEvents();
          }

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

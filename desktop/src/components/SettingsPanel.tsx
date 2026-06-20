// Settings drawer: labels, colorMode, synth, timeWindow, hitWindow, octave, MIDI, language.
// All user-facing strings go through i18n.t().

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMidiDeviceStore } from "@/store/useMidiDeviceStore";
import { useSettingsStore, type ColorMode } from "@/store/useSettingsStore";
import { useInputStore } from "@/store/useInputStore";
import { synthNoteOn, synthNoteOff } from "@/lib/synth";
import {
  loadSplendid,
  subscribeSplendidStatus,
  unloadSplendid,
  type SoundfontStatus,
} from "@/lib/soundfont-engine";
import { unlock } from "@/lib/audio-context";
import { usePracticeStore } from "@/store/usePracticeStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useSongStore } from "@/store/useSongStore";
import { useT, LOCALES } from "@/lib/i18n";

import { useRhythmGameStore } from "@/store/useRhythmGameStore";
import { useAppModeStore } from "@/store/useAppModeStore";
import { usePlaybackModeStore } from "@/store/usePlaybackModeStore";
import { useVFXStore } from "@/store/useVFXStore";

function handlePractice(midi: number) {
  const practice = usePracticeStore.getState();
  if (!practice.enabled) return;
  const song = useSongStore.getState().song;
  if (!song) return;
  const pb = usePlaybackStore.getState();
  const songT = pb.currentSongTime(song);
  const hitWindow = useSettingsStore.getState().hitWindow;

  const result = practice.match(song, midi, songT, hitWindow);
  // Rhythm game integration
  const mode = useAppModeStore.getState().mode;
  const isRhythmMode = mode === "random-practice" || mode === "score-practice";
  if (isRhythmMode) {
    const rg = useRhythmGameStore.getState();
    if (result.kind === "hit") {
      rg.onHit(result.deltaTime ?? 0);
      // Spawn hit particles at a random position in the upper canvas area
      const x = 100 + Math.random() * 400;
      const y = 100 + Math.random() * 200;
      useVFXStore.getState().spawnHit(x, y);
    } else {
      rg.onMiss();
      useInputStore.getState().flashWrong(midi);
    }
  } else {
    if (result.kind === "wrong") useInputStore.getState().flashWrong(midi);
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const t = useT();
  const init = useMidiDeviceStore((s) => s.init);
  const refresh = useMidiDeviceStore((s) => s.refresh);
  const supported = useMidiDeviceStore((s) => s.supported);
  const inputs = useMidiDeviceStore((s) => s.inputs);
  const selectedId = useMidiDeviceStore((s) => s.selectedId);
  const select = useMidiDeviceStore((s) => s.select);

  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const octave = useSettingsStore((s) => s.octave);
  const showLabels = useSettingsStore((s) => s.showLabels);
  const colorMode = useSettingsStore((s) => s.colorMode);
  const synthEnabled = useSettingsStore((s) => s.synthEnabled);
  const timeWindow = useSettingsStore((s) => s.timeWindow);
  const hitWindow = useSettingsStore((s) => s.hitWindow);
  const setShowLabels = useSettingsStore((s) => s.setShowLabels);
  const setColorMode = useSettingsStore((s) => s.setColorMode);
  const setSynthEnabled = useSettingsStore((s) => s.setSynthEnabled);
  const setTimeWindow = useSettingsStore((s) => s.setTimeWindow);
  const setHitWindow = useSettingsStore((s) => s.setHitWindow);
  const setOctave = useSettingsStore((s) => s.setOctave);
  const synthBackend = useSettingsStore((s) => s.synthBackend);
  const setSynthBackend = useSettingsStore((s) => s.setSynthBackend);

  const [sfStatus, setSfStatus] = useState<SoundfontStatus>({ kind: "idle" });
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => subscribeSplendidStatus(setSfStatus), []);

  useEffect(() => {
    if (open) init();
  }, [open, init]);

 const midiListener = (status: number, d1: number, d2: number) => {
    if (usePlaybackModeStore.getState().listenOnly) return;
   const cmd = status & 0xf0;
   if (cmd === 0x90 && d2 > 0) {
      unlock();
      useInputStore.getState().onNoteOn(d1, d2, "midi");
      synthNoteOn(d1, d2, useSettingsStore.getState().synthEnabled);
      handlePractice(d1);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      useInputStore.getState().onNoteOff(d1);
      synthNoteOff(d1);
    }
  };

  useEffect(() => {
    if (!open) return;
    const { selectedId: persisted } = useMidiDeviceStore.getState();
    if (!persisted) return;
    if (inputs.some((i) => i.id === persisted)) {
      void select(persisted, midiListener);
    }
  }, [open, inputs, select]);

  const handleSelectInput = (id: string) => {
    void select(id, midiListener);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  if (!open) return null;

  const colorModeOptions: { v: ColorMode; label: string }[] = [
    { v: "split", label: t("settings.color_split") },
    { v: "track", label: t("settings.color_track") },
    { v: "none", label: t("settings.color_none") },
  ];

  return (
    <div className="absolute right-0 top-0 z-20 flex h-full w-72 flex-col border-l border-bg-2 bg-bg-1/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-bg-2 px-4 py-3">
        <h2 className="text-sm font-semibold">{t("settings.title")}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>{t("settings.close")}</Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        <Field label={t("settings.language")}>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-xs"
          >
            {LOCALES.map((opt) => (
              <option key={opt.code} value={opt.code}>{opt.nativeName}</option>
            ))}
          </select>
        </Field>

        <Field label={t("settings.show_labels")}>
          <Switch checked={showLabels} onChange={setShowLabels} />
        </Field>
        <Field label={t("settings.color_mode")}>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value as ColorMode)}
            className="rounded border border-bg-3 bg-bg-2 px-2 py-1 text-xs"
          >
            {colorModeOptions.map((o) => (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t("settings.synth_enabled")}>
          <Switch checked={synthEnabled} onChange={setSynthEnabled} />
        </Field>
        <Field label={t("settings.time_window", { n: timeWindow.toFixed(1) })}>
          <input
            type="range"
            min={1} max={8} step={0.5}
            value={timeWindow}
            onChange={(e) => setTimeWindow(Number(e.target.value))}
            className="w-24"
          />
        </Field>
        <Field label={t("settings.hit_window", { n: Math.round(hitWindow * 1000) })}>
          <input
            type="range"
            min={50} max={800} step={10}
            value={hitWindow * 1000}
            onChange={(e) => setHitWindow(Number(e.target.value) / 1000)}
            className="w-24"
          />
        </Field>
        <Field label={t("settings.octave", { n: octave })}>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setOctave(Math.max(0, octave - 1))}>-</Button>
            <Button size="sm" variant="outline" onClick={() => setOctave(Math.min(7, octave + 1))}>+</Button>
          </div>
        </Field>

        <div className="border-t border-bg-2 pt-3">
          <h3 className="mb-2 text-xs font-semibold text-muted">{t("settings.tone")}</h3>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={synthBackend === "additive" ? "default" : "outline"}
              onClick={() => setSynthBackend("additive")}
              className="flex-1"
            >
              {t("settings.additive")}
            </Button>
            <Button
              size="sm"
              variant={synthBackend === "splendid" ? "default" : "outline"}
              onClick={() => setSynthBackend("splendid")}
              className="flex-1"
            >
              Splendid Grand
            </Button>
          </div>
          {synthBackend === "splendid" && (
            <div className="mt-2 space-y-2">
              {sfStatus.kind === "idle" && (
                <Button size="sm" variant="outline" onClick={() => loadSplendid()} className="w-full">
                  {t("settings.load_samples", { mb: "6" })}
                </Button>
              )}
              {sfStatus.kind === "loading" && (
                <div className="text-xs text-muted">
                  {t("settings.loading", { loaded: sfStatus.loaded, total: sfStatus.total })}
                </div>
              )}
              {sfStatus.kind === "ready" && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-400">{t("settings.ready")}</span>
                  <Button size="sm" variant="ghost" onClick={unloadSplendid}>
                    {t("settings.unload")}
                  </Button>
                </div>
              )}
              {sfStatus.kind === "error" && (
                <div className="text-xs text-red-400">
                  {t("settings.load_failed", { msg: sfStatus.message })}
                </div>
              )}
              <div className="text-xs text-muted">{t("settings.sf_hint")}</div>
            </div>
          )}
        </div>

        <div className="border-t border-bg-2 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted">{t("settings.midi_devices")}</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              disabled={refreshing}
              title={t("settings.rescan_tip")}
              className="h-6 px-2"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {!supported && inputs.length === 0 && (
            <div className="rounded bg-bg-2 p-2 text-xs text-muted">{t("settings.no_backend")}</div>
          )}
          {supported && inputs.length === 0 && (
            <div className="rounded bg-bg-2 p-2 text-xs text-muted">{t("settings.no_input")}</div>
          )}
          {inputs.length > 0 && (
            <ul className="space-y-1">
              {inputs.map((inp) => (
                <li key={inp.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectInput(inp.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                      selectedId === inp.id ? "bg-accent text-bg-0" : "bg-bg-2 hover:bg-bg-3"
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded px-1 text-[10px] ${
                        inp.source === "native"
                          ? "bg-accent/20 text-accent"
                          : "bg-bg-3 text-muted"
                      }`}
                    >
                      {inp.source === "native" ? t("settings.native") : t("settings.web")}
                    </span>
                    <span className="truncate">{inp.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-bg-3"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

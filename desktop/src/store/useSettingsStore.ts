// Settings store with localStorage persistence.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/lib/i18n";

export type ColorMode = "split" | "track" | "none";
export type SynthBackend = "additive" | "splendid";

export interface Settings {
  locale: Locale;
  octave: number;
  showLabels: boolean;
  colorMode: ColorMode;
  /** Master synth enable (any backend). */
  synthEnabled: boolean;
  /** Which synth backend to use when synthEnabled is true. */
  synthBackend: SynthBackend;
  timeWindow: number;
  hitWindow: number;
}

interface SettingsState extends Settings {
  setLocale: (l: Locale) => void;
  setOctave: (v: number) => void;
  setShowLabels: (v: boolean) => void;
  setColorMode: (m: ColorMode) => void;
  setSynthEnabled: (v: boolean) => void;
  setSynthBackend: (b: SynthBackend) => void;
  setTimeWindow: (v: number) => void;
  setHitWindow: (v: number) => void;
}

function detectInitialLocale(): Locale {
  if (typeof navigator === "undefined") return "zh-CN";
  const lang = (navigator.language || "zh-CN").toLowerCase();
  // Match Locale union precisely; fall back to en for anything else.
  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("de")) return "de";
  if (lang.startsWith("en")) return "en";
  return "en";
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      locale: detectInitialLocale(),
      octave: 4,
      showLabels: true,
      colorMode: "split",
      synthEnabled: true,
      synthBackend: "additive",
      timeWindow: 3.0,
      hitWindow: 0.3,

      setLocale: (locale) => {
        // Keep <html lang> in sync for a11y / font selection.
        if (typeof document !== "undefined") {
          document.documentElement.lang = locale;
        }
        set({ locale });
      },
      setOctave: (octave) => set({ octave }),
      setShowLabels: (v) => set({ showLabels: v }),
      setColorMode: (m) => set({ colorMode: m }),
      setSynthEnabled: (v) => set({ synthEnabled: v }),
      setSynthBackend: (synthBackend) => set({ synthBackend }),
      setTimeWindow: (v) => set({ timeWindow: v }),
      setHitWindow: (v) => set({ hitWindow: v }),
    }),
    {
      name: "piano.settings",
      version: 3,
      partialize: (s) => ({
        locale: s.locale,
        octave: s.octave,
        showLabels: s.showLabels,
        colorMode: s.colorMode,
        synthEnabled: s.synthEnabled,
        synthBackend: s.synthBackend,
        timeWindow: s.timeWindow,
        hitWindow: s.hitWindow,
      }),
      // Apply html lang on rehydration too, so reload preserves UI language hint.
      onRehydrateStorage: () => (state) => {
        if (state?.locale && typeof document !== "undefined") {
          document.documentElement.lang = state.locale;
        }
      },
    },
  ),
);

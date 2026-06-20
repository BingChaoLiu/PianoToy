// Lightweight i18n: no external dependency.
// Locale lives in useSettingsStore; components re-render on change.

import type { Translation } from "./types";
import { useSettingsStore } from "@/store/useSettingsStore";
import zhCN from "./zh-CN";
import en from "./en";
import ja from "./ja";
import es from "./es";
import fr from "./fr";
import de from "./de";

export type Locale = "zh-CN" | "en" | "ja" | "es" | "fr" | "de";

export const LOCALES: { code: Locale; nativeName: string }[] = [
  { code: "zh-CN", nativeName: "简体中文" },
  { code: "en", nativeName: "English" },
  { code: "ja", nativeName: "日本語" },
  { code: "es", nativeName: "Español" },
  { code: "fr", nativeName: "Français" },
  { code: "de", nativeName: "Deutsch" },
];

const DICTS: Record<Locale, Translation> = {
  "zh-CN": zhCN,
  "en": en,
  "ja": ja,
  "es": es,
  "fr": fr,
  "de": de,
};

export type TranslateParams = Record<string, string | number>;

/** Lookup `key` (dotted path) in the current locale, with optional {param} interpolation. */
export function translate(locale: Locale, key: string, params?: TranslateParams): string {
  const dict = DICTS[locale] ?? DICTS["en"];
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  let s = typeof cur === "string" ? cur : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}

// React hook bound to the persisted locale.
export function useT() {
  const locale = useSettingsStore((s) => s.locale);
  return (key: string, params?: TranslateParams) => translate(locale, key, params);
}

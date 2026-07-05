import { describe, it, expect, beforeEach } from "vitest";
import { translate, LOCALES } from "@/lib/i18n";

describe("i18n", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("lists all 6 supported languages", () => {
    expect(LOCALES.map((l) => l.code)).toEqual(["zh-CN", "en", "ja", "es", "fr", "de"]);
  });

  it("each locale has a non-empty native name", () => {
    for (const l of LOCALES) {
      expect(l.nativeName.length).toBeGreaterThan(0);
    }
  });

  it("translates a key into each supported language", () => {
    expect(translate("zh-CN", "app.title")).toMatch(/[\u4e00-\u9fff]/);
    expect(translate("en", "app.title")).toBe("Piano MIDI Visualizer");
    expect(translate("ja", "app.title")).toMatch(/[\u3040-\u30ff]/);
    expect(translate("es", "app.title")).toMatch(/Piano/);
    expect(translate("fr", "app.title")).toMatch(/Piano/);
    expect(translate("de", "app.title")).toMatch(/Klavier/);
  });

  it("interpolates {param} placeholders", () => {
    const out = translate("en", "toast.loaded", { name: "song.mid", n: 42 });
    expect(out).toBe("Loaded song.mid (42 notes)");
  });

  it("interpolates in Chinese without mangling", () => {
    const out = translate("zh-CN", "song.notes_count", { n: 5 });
    expect(out).toContain("5");
    expect(out).toMatch(/[\u4e00-\u9fff]/);
  });

  it("falls back to the key when unknown", () => {
    expect(translate("en", "nonexistent.key")).toBe("nonexistent.key");
    expect(translate("en", "app.nonexistent")).toBe("app.nonexistent");
  });

  it("all languages expose settings.title correctly", () => {
    const all = [
      translate("en", "settings.title"),
      translate("zh-CN", "settings.title"),
      translate("ja", "settings.title"),
      translate("es", "settings.title"),
      translate("fr", "settings.title"),
      translate("de", "settings.title"),
    ];
    for (const s of all) {
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toBe("settings.title");
    }
  });

  it("SoundFont load_failed preserves the dynamic error", () => {
    const msg = translate("zh-CN", "settings.load_failed", { msg: "network" });
    expect(msg).toContain("network");
  });

  it("exposes the musicxml-conversion toast keys in every locale", () => {
    // Guards the 6-locale contract for the new MIDI→MusicXML conversion flow.
    // Each key must resolve to a non-empty, non-fallback string.
    const keys = [
      "toast.generating_musicxml_first_run",
      "toast.generating_musicxml",
      "toast.musicxml_generated",
      "toast.musicxml_failed",
      "import_dialog.generate_musicxml",
      "import_dialog.generate_musicxml_hint",
      "import_dialog.stage_loading_converter",
      "import_dialog.stage_loading_converter_hint",
      "import_dialog.stage_converting",
      "import_dialog.stage_converting_hint",
      "import_dialog.importing",
      "import_dialog.conversion_failed",
      "import_dialog.continue_without_sheet_music",
    ];
    for (const code of ["zh-CN", "en", "ja", "es", "fr", "de"]) {
      for (const key of keys) {
        const out = translate(code as any, key as any);
        expect(out, `${code} ${key}`).not.toBe(key);
        expect(out.length).toBeGreaterThan(0);
      }
    }
  });

  it("interpolates {name} in the musicxml_generated toast", () => {
    const out = translate("en", "toast.musicxml_generated", { name: "Ode" });
    expect(out).toContain("Ode");
  });
});

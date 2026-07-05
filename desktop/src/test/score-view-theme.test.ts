// Regression test for the highlight CSS on the Verovio score view.
//
// Background: Verovio emits, per score, an id-scoped <style> block forcing
// `stroke: currentColor` on every path/rect/line/polygon (specificity 1,0,1).
// A class-only highlight rule (0,1,1) loses to that #id rule, so the
// .vrv-playing fill/stroke never applied and the highlighted note was
// indistinguishable from surrounding ink. The fix lives in
// src/lib/verovio-score-theme.ts (a TS constant injected by ScoreView at
// runtime): every override carries !important, which beats Verovio's
// non-!important #id rule regardless of specificity.
//
// White sheet style: the app now shows Verovio's native black ink on a white
// page, so only the currently-playing note needs to be forced red (#e53935).
// This test asserts the !important contract that keeps that override working.
//
// We test against the exported constant rather than globals.css?raw because
// Vitest stubs `.css?raw` imports to empty, which made a real-file test flaky.

import { describe, it, expect } from "vitest";
import { VEROVIO_SCORE_THEME_CSS } from "@/lib/verovio-score-theme";

describe("Verovio score-view highlight CSS (regression for highlighted note visibility)", () => {
  const css = VEROVIO_SCORE_THEME_CSS;

  it("targets the score-view-host container", () => {
    expect(css).toContain(".score-view-host");
  });

  it("forces the active note red (#e53935) with !important on fill + stroke", () => {
    const hl = css.match(/\.vrv-playing[^{]*\{[^}]*fill[^}]*\}/);
    expect(hl, "expected a .vrv-playing fill override").toBeTruthy();
    expect(hl![0]).toMatch(/#e53935/);
    expect(hl![0]).toMatch(/fill:\s*#e53935\s*!important/);
    expect(hl![0]).toMatch(/stroke:\s*#e53935\s*!important/);
  });

  it("scopes the highlight to notehead + stem + path + use so the whole note lights up", () => {
    // Each of these sub-scopes must carry the red override so a note's
    // notehead AND stem AND any path/use glyphs all turn red together.
    for (const sub of [".notehead", ".stem", "path", "use"]) {
      const re = new RegExp(`\\.vrv-playing\\s${sub.replace(/\./g, "\\\\.")}[^{]*\\{`);
      // The path/use selectors target the bare tags; .notehead/.stem are
      // class sub-scopes. Match either form.
      const altRe = new RegExp(`\\.vrv-playing[^{]*\\b${sub.replace(".", "")}\\b[^{]*\\{`);
      expect(
        re.test(css) || altRe.test(css),
        `expected a .vrv-playing override covering ${sub}`,
      ).toBe(true);
    }
  });

  it("does NOT override Verovio's ink color globally (white sheet shows native black)", () => {
    // The old dark theme forced #c9ccd6/#e8eaf2 on every path/use line. On the
    // white sheet we want Verovio's native black ink, so the global override
    // must be gone — only .vrv-playing should carry a color override.
    expect(css).not.toMatch(/\.definition-scale[^}]*color:\s*#e8eaf2/);
    expect(css).not.toMatch(/svg\s+path,[^}]*stroke:\s*#c9ccd6/);
  });

  it("every stroke/fill declaration in the highlight rule carries !important", () => {
    // Specifically guard the .vrv-playing block: if anyone strips !important
    // there, Verovio's #id rule wins again and the highlight goes invisible.
    const rules = css.match(/\.score-view-host[^{]*\{[^}]+\}/g) ?? [];
    for (const r of rules) {
      if (/vrv-playing/.test(r)) {
        const decls = r.match(/\{([^}]+)\}/)?.[1] ?? "";
        for (const decl of decls.split(";")) {
          if (/(stroke|fill)\s*:/.test(decl) && !/none/.test(decl)) {
            expect(decl.trim()).toMatch(/!important$/);
          }
        }
      }
    }
  });
});

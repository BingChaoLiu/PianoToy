// Regression test for the dark-theme CSS override on the Verovio score view.
//
// Background: Verovio emits, per score, an id-scoped <style> block forcing
// `stroke: currentColor` on every path/rect/line/polygon, and sets
// color="black" on the inner .definition-scale <svg>. With class-only CSS
// overrides (specificity 0,1,1) the app lost to Verovio's #id rule (1,0,1),
// so all ink rendered black-on-black → "nothing is drawn" on the dark UI.
//
// The fix lives in src/lib/verovio-dark-theme.ts (a TS constant injected by
// ScoreView at runtime). This test asserts the contract that prevents the
// bug from returning: every override rule carries !important (which beats
// Verovio's non-!important #id rule regardless of specificity). If someone
// strips !important, this test fails and the blank-render bug returns.
//
// We test against the exported constant rather than globals.css?raw because
// Vitest stubs `.css?raw` imports to empty, which made a real-file test flaky.

import { describe, it, expect } from "vitest";
import { VEROVIO_DARK_THEME_CSS } from "@/lib/verovio-dark-theme";

describe("Verovio dark-theme CSS override (regression for blank render)", () => {
  const css = VEROVIO_DARK_THEME_CSS;

  it("targets the score-view-host container", () => {
    expect(css).toContain(".score-view-host");
  });

  it("forces a light color on .definition-scale so currentColor goes light", () => {
    // Verovio sets color="black" here and its stroke rule uses currentColor.
    // We must flip color with !important to win.
    const rule = css.match(/\.score-view-host svg \.definition-scale \{[^}]+\}/);
    expect(rule, "expected a .definition-scale override rule").toBeTruthy();
    expect(rule![0]).toMatch(/color:\s*#e8eaf2\s*!important/);
  });

  it("overrides stroke + fill with !important on every ink element type", () => {
    // Verovio draws staff lines, barlines, stems, beams, clefs, and noteheads
    // as <path> / <use> (NOT <line>/<rect>). The override must cover path + use
    // and carry !important to beat the #id-scoped stroke:currentColor rule.
    for (const tag of ["path", "use"]) {
      const re = new RegExp(`\\.score-view-host svg[^{]*\\b${tag}\\b[^{]*\\{[^}]*stroke[^}]*!important`);
      expect(
        css,
        `expected an !important stroke override covering <${tag}>`,
      ).toMatch(re);
      const fillRe = new RegExp(`\\.score-view-host svg[^{]*\\b${tag}\\b[^{]*\\{[^}]*fill[^}]*!important`);
      expect(css, `expected an !important fill override covering <${tag}>`).toMatch(fillRe);
    }
  });

  it("makes the page background transparent", () => {
    expect(css).toMatch(/\.page-margin[^}]*fill:\s*transparent\s*!important/);
  });

  it("highlights the currently-playing note with the accent color + !important", () => {
    const hl = css.match(/\.vrv-playing[^{]*\{[^}]*fill[^}]*\}/);
    expect(hl, "expected a .vrv-playing fill override").toBeTruthy();
    expect(hl![0]).toMatch(/#f5b942/);
    expect(hl![0]).toMatch(/!important/);
  });

  it("does NOT contain the old buggy non-important override (would re-introduce blank render)", () => {
    // The original broken CSS had `stroke: #c9ccd6;` WITHOUT !important. Make
    // sure no stroke/fill override on path/use lacks !important.
    const rules = css.match(/\.score-view-host[^{]*\{[^}]+\}/g) ?? [];
    for (const r of rules) {
      if (/stroke|fill/.test(r) && !/vrv-playing/.test(r)) {
        // every stroke/fill declaration in a non-highlight rule must be !important
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

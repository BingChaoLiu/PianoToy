// Verovio dark-theme CSS, as a single exported string.
//
// WHY A TS CONSTANT (not globals.css): Verovio emits, per score, an id-scoped
// <style> block forcing `stroke: currentColor` on every path/rect/line/polygon
// and sets color="black" on the inner .definition-scale <svg>. Class-only
// overrides lose to that #id rule by specificity, so the score rendered
// black-on-black (invisible) until every rule here got !important. Keeping
// these rules as a constant lets a unit test assert the !important contract
// reliably (Vitest stubs `.css?raw` imports to empty, so a real file can't be
// tested directly). ScoreView injects this once via a <style> tag.
//
// The same rules are applied to the .score-view-host container.
export const VEROVIO_DARK_THEME_CSS = `
.score-view-host svg {
  width: 100%;
  height: auto;
  display: block;
}
/* Page background: transparent so the app's bg shows through. */
.score-view-host svg .page-margin,
.score-view-host svg rect {
  fill: transparent !important;
}
/* Flip the ink color that currentColor (used by Verovio stroke rule) reads. */
.score-view-host svg .definition-scale {
  color: #e8eaf2 !important;
  fill: #e8eaf2 !important;
}
/* Staff lines, barlines, beams, stems, clefs: force light stroke + fill.
   !important is mandatory: Verovio's #id path { stroke: currentColor } rule
   has specificity (1,0,1); class rules are (0,1,1) and lose without it. */
.score-view-host svg path,
.score-view-host svg line,
.score-view-host svg polygon,
.score-view-host svg ellipse,
.score-view-host svg polyline,
.score-view-host svg use {
  stroke: #c9ccd6 !important;
  fill: #e8eaf2 !important;
}
/* Text (labels, tempo) — keep light, no stroke. */
.score-view-host svg text {
  fill: #c9ccd6 !important;
  stroke: none !important;
}
/* Currently-sounding note(s): warm accent fill for emphasis.
   Scoped under .note/.stem/.notehead so the whole note lights up. */
.score-view-host svg .vrv-playing,
.score-view-host svg .vrv-playing .notehead,
.score-view-host svg .vrv-playing .stem,
.score-view-host svg .vrv-playing path,
.score-view-host svg .vrv-playing use {
  fill: #f5b942 !important;
  stroke: #f5b942 !important;
}
`;

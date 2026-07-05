// Verovio score-view highlight CSS, as a single exported string.
//
// WHY A TS CONSTANT (not globals.css): Verovio emits, per score, an id-scoped
// <style> block forcing `stroke: currentColor` on every path/rect/line/polygon
// (specificity 1,0,1). Class-only highlight rules (0,1,1) lose to that #id
// rule, so the .vrv-playing fill/stroke never applied and the highlighted note
// looked identical to surrounding ink. Keeping the highlight as a constant lets
// a unit test assert the !important contract reliably (Vitest stubs `.css?raw`
// imports to empty, so a real file can't be tested directly).
//
// Score background and ink: on the white sheet the app shows Verovio's native
// black ink on a white page — no overrides needed. Only the currently-playing
// note needs to be forced red, and that override MUST carry !important.
//
// The rules are scoped under the .score-view-host container.
export const VEROVIO_SCORE_THEME_CSS = `
.score-view-host svg {
  width: 100%;
  height: auto;
  display: block;
}
/* Currently-sounding note(s): strong red fill + stroke for emphasis.
   Scoped under .note/.stem/.notehead so the whole note lights up.
   !important is mandatory: Verovio's #id path { stroke: currentColor } rule
   has specificity (1,0,1); class rules are (0,1,1) and lose without it. */
.score-view-host svg .vrv-playing,
.score-view-host svg .vrv-playing .notehead,
.score-view-host svg .vrv-playing .stem,
.score-view-host svg .vrv-playing path,
.score-view-host svg .vrv-playing use {
  fill: #e53935 !important;
  stroke: #e53935 !important;
}
`;

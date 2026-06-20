import { buildFromRows, type Row } from "./builder";

export function buildBachPreludeC() {
  const s = 0.35; // sixteenth note duration
  const rows: Row[] = [];
  
  // Each bar has a characteristic broken chord pattern: 4 sixteenth notes
  // Bars 1-12 of the Prelude in C Major (simplified)
  const patterns: number[][] = [
    // Bar 1: C major
    [60, 64, 67, 72, 67, 64],
    // Bar 2: Dm/C
    [60, 62, 69, 74, 69, 62],
    // Bar 3: Em/G
    [59, 67, 71, 76, 71, 67],
    // Bar 4: F major
    [60, 65, 69, 74, 69, 65],
    // Bar 5: G7
    [59, 67, 71, 74, 71, 67],
    // Bar 6: Am
    [57, 64, 69, 76, 69, 64],
    // Bar 7: Fm6/G
    [59, 65, 68, 74, 68, 65],
    // Bar 8: G major
    [55, 59, 67, 74, 67, 59],
    // Bar 9: C major
    [60, 64, 67, 76, 67, 64],
    // Bar 10: Dm
    [62, 69, 74, 77, 74, 69],
    // Bar 11: G7
    [59, 67, 71, 77, 71, 67],
    // Bar 12: C major
    [60, 64, 67, 79, 67, 64],
  ];

  patterns.forEach((p, bar) => {
    const baseTime = bar * s * 6;
    p.forEach((midi, i) => {
      rows.push([midi, baseTime + i * s, s * 0.85, i === 3 ? 78 : 65, 0]);
    });
  });

  // Bass notes (whole notes per bar)
  const bassNotes = [36, 36, 35, 36, 35, 33, 35, 31, 36, 38, 35, 36];
  bassNotes.forEach((midi, i) => {
    rows.push([midi, i * s * 6, s * 5.5, 70, 1]);
  });

  return buildFromRows("Prelude in C Major (WTC I) - J.S. Bach", rows);
}

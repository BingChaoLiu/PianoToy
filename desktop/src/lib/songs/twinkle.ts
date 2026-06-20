import { buildFromRows, type Row } from "./builder";

export function buildTwinkleSong() {
  const q = 0.5, h = 1.0;
  const melody: Row[] = [
    [60,0,q],[60,q,q],[67,2*q,q],[67,3*q,q],[69,4*q,q],[69,5*q,q],[67,6*q,h],
    [65,8*q,q],[65,9*q,q],[64,10*q,q],[64,11*q,q],[62,12*q,q],[62,13*q,q],[60,14*q,h],
    [67,16*q,q],[67,17*q,q],[65,18*q,q],[65,19*q,q],[64,20*q,q],[64,21*q,q],[62,22*q,h],
    [67,24*q,q],[67,25*q,q],[65,26*q,q],[65,27*q,q],[64,28*q,q],[64,29*q,q],[62,30*q,h],
    [60,32*q,q],[60,33*q,q],[67,34*q,q],[67,35*q,q],[69,36*q,q],[69,37*q,q],[67,38*q,h],
    [65,40*q,q],[65,41*q,q],[64,42*q,q],[64,43*q,q],[62,44*q,q],[62,45*q,q],[60,46*q,h],
  ].map((r) => [r[0], r[1], (r[2] as number) * 0.92, 92, 0]) as Row[];
  const bass: Row[] = [];
  const chords = [
    [48, 60, 67], [48, 60, 67],
    [53, 60, 65], [53, 60, 65],
    [55, 62, 67], [55, 62, 67],
    [55, 62, 67], [55, 62, 67],
    [48, 60, 67], [48, 60, 67],
    [53, 60, 65], [53, 60, 65],
  ];
  chords.forEach((c, i) => c.forEach((m) => bass.push([m, i * 2.0, 1.84, 60, 1])));
  return buildFromRows("Twinkle Twinkle Little Star - Traditional", melody.concat(bass));
}

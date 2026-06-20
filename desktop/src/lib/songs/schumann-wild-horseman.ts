import { buildFromRows, type Row } from "./builder";

export function buildSchumannWildHorseman() {
  const q = 0.3, h = 0.6, e = 0.15;
  
  const melody: Row[] = [
    // A section (bars 1-4)
    [71,0,q],[71,q,e],[71,1.5*e,e],[71,2*e,q],[69,3*e,q],[67,4*e,h],
    [66,4*e+h,q],[66,q,e],[66,1.5*e,e],[66,2*e,q],[64,3*e,q],[66,4*e,h],
    // Bars 5-8
    [71,8*e,q],[71,q,e],[71,1.5*e,e],[71,2*e,q],[69,3*e,q],[67,4*e,h],
    [69,8*e+4*e,q],[67,q,e],[69,1.5*e,e],[71,2*e,h],[71,2*e+h,q],[72,3*e,q],[71,4*e,h],
    // B section (bars 9-12)
    [74,12*e,q],[72,12*e+q,q],[71,14*e,q],[69,15*e,q],
    [67,16*e,q],[69,17*e,q],[71,18*e,h],
    [74,20*e,q],[72,21*e,q],[71,22*e,q],[69,23*e,q],
    [67,24*e,q],[66,25*e,q],[67,26*e,h],
    // Return to A (bars 13-16)
    [71,28*e,q],[71,q,e],[71,1.5*e,e],[71,2*e,q],[69,3*e,q],[67,4*e,h],
    [66,32*e,q],[66,q,e],[66,1.5*e,e],[66,2*e,q],[64,3*e,q],[66,4*e,h],
    [71,36*e,q],[71,q,e],[71,1.5*e,e],[71,2*e,q],[69,3*e,q],[67,4*e,h],
    [67,40*e,q],[66,41*e,q],[67,42*e,h],
  ].map((r) => [r[0], r[1], (r[2] as number) * 0.88, 88, 0]) as Row[];

  const bass: Row[] = [];
  const chords = [
    [43,55,59],[43,55,59],[43,55,59],[43,55,59],
    [43,55,59],[43,55,59],[43,55,59],[43,55,59],
    [47,55,62],[47,55,62],[43,55,59],[43,55,59],
    [50,57,62],[50,57,62],[43,55,59],[43,55,59],
  ];
  chords.forEach((c, i) => c.forEach((m) => bass.push([m, i * 1.2, 1.08, 55, 1])));

  return buildFromRows("Wild Horseman - Schumann", melody.concat(bass));
}

import { buildFromRows, type Row } from "./builder";

export function buildTchaikovskyOldFrench() {
  const q = 0.45, h = 0.9, e = 0.225;
  
  const melody: Row[] = [
    // A section (bars 1-4)
    [67,0,q],[69,q,q],[71,2*q,q],[67,3*q,h],
    [69,4*q,q],[71,5*q,q],[72,6*q,h],
    [74,7*q,q],[72,7.5*q,e],[71,8*q,q],[69,9*q,q],
    [67,10*q,h],[66,11*q,q],
    // Bars 5-8
    [67,12*q,q],[69,13*q,q],[71,14*q,q],[67,15*q,h],
    [69,16*q,q],[71,17*q,q],[69,18*q,h],
    [67,19*q,q],[66,19.5*q,e],[64,20*q,q],[66,21*q,q],
    [67,22*q,h],
    // B section (bars 9-12)
    [71,23*q,q],[72,24*q,q],[74,25*q,q],[71,26*q,h],
    [72,27*q,q],[74,28*q,q],[76,29*q,h],
    [74,30*q,q],[72,30.5*q,e],[71,31*q,q],[69,32*q,q],
    [67,33*q,h],
    // Return (bars 13-16)
    [71,34*q,q],[69,35*q,q],[67,36*q,q],[66,37*q,h],
    [67,38*q,q],[69,39*q,q],[67,40*q,h],
    [69,41*q,q],[67,42*q,q],[66,43*q,q],[64,44*q,h],
    [67,45*q,h],
  ].map((r) => [r[0], r[1], (r[2] as number) * 0.9, 82, 0]) as Row[];

  const bass: Row[] = [];
  const chords = [
    [43,55,59],[43,55,59],[47,55,62],[43,55,59],
    [43,55,59],[47,55,62],[43,55,59],[43,55,59],
    [43,55,59],[43,55,59],[47,55,62],[43,55,59],
    [47,55,62],[47,55,62],[43,55,59],[43,55,59],
  ];
  chords.forEach((c, i) => c.forEach((m) => bass.push([m, i * 1.35, 1.22, 55, 1])));

  return buildFromRows("Old French Song - Tchaikovsky", melody.concat(bass));
}

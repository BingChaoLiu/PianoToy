import { buildFromRows, type Row } from "./builder";

export function buildBurgmuellerArabesque() {
  const q = 0.3, e = 0.15, h = 0.6;
  
  const melody: Row[] = [
    // Opening: bright arpeggiated figure
    [71,0,e],[74,e,e],[76,2*e,e],[79,3*e,e],[76,4*e,e],[74,5*e,e],
    [71,6*e,e],[74,7*e,e],[76,8*e,e],[79,9*e,e],[76,10*e,e],[74,11*e,e],
    [71,12*e,e],[67,13*e,e],[71,14*e,e],[74,15*e,e],[71,16*e,h],
    // Second phrase
    [74,18*e,e],[76,19*e,e],[79,20*e,e],[81,21*e,e],[79,22*e,e],[76,23*e,e],
    [74,24*e,e],[76,25*e,e],[79,26*e,e],[81,27*e,e],[79,28*e,e],[76,29*e,e],
    [74,30*e,e],[71,31*e,e],[74,32*e,h],
    // Middle section: lyrical
    [76,34*e,q],[79,34*e+q,q],[81,36*e,q],[79,37*e,q],
    [76,38*e,q],[74,39*e,q],[71,40*e,h],
    [69,42*e,q],[71,43*e,q],[74,44*e,q],[71,45*e,q],
    [69,46*e,q],[67,47*e,q],[69,48*e,h],
    // Return
    [71,50*e,e],[74,51*e,e],[76,52*e,e],[79,53*e,e],[76,54*e,e],[74,55*e,e],
    [71,56*e,e],[74,57*e,e],[76,58*e,e],[79,59*e,e],[76,60*e,e],[74,61*e,e],
    [71,62*e,e],[67,63*e,e],[71,64*e,h],
  ].map((r) => [r[0], r[1], (r[2] as number) * 0.88, 85, 0]) as Row[];

  const bass: Row[] = [];
  const chords = [
    [43,55,59],[43,55,59],[43,55,59],
    [47,55,62],[47,55,62],
    [50,57,62],[50,57,62],
    [47,55,62],[47,55,62],
    [43,55,59],[43,55,59],
    [43,55,59],[43,55,59],
    [43,55,59],[43,55,59],
    [43,55,59],
  ];
  chords.forEach((c, i) => c.forEach((m) => bass.push([m, i * 1.2, 1.08, 55, 1])));

  return buildFromRows("Arabesque (Op.100 No.2) - Burgmuller", melody.concat(bass));
}

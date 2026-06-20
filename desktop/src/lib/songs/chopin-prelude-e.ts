import { buildFromRows, type Row } from "./builder";

export function buildChopinPreludeE() {
  const h = 0.9, q = 0.45, w = 1.8;
  
  // Famous melancholic melody with held left-hand chords
  const melody: Row[] = [
    // Right hand melody
    [76,0,h],[76,1*h,h],[76,2*h,h],[75,3*h,h],
    [76,4*h,h],[76,5*h,q],[78,5*h+q,q],[76,6*h,h],
    [75,7*h,h],[76,8*h,h],[78,9*h,h],[79,10*h,q],[78,10*h+q,q],
    [76,11*h,h],[75,12*h,h],[71,13*h,w],
    // Continuation
    [76,15*h,h],[76,16*h,h],[75,17*h,h],[76,18*h,q],[78,18*h+q,q],
    [79,19*h,h],[78,20*h,h],[76,21*h,h],[75,22*h,h],
    [76,23*h,h],[75,24*h,h],[71,25*h,w],
  ].map((r) => [r[0], r[1], (r[2] as number) * 0.92, 75, 0]) as Row[];

  // Left hand: sustained chords
  const bass: Row[] = [
    [40,0,w*1.5],[52,0,w*1.5],[59,0,w*1.5],[64,0,w*1.5],
    [40,3*h,w*1.5],[52,3*h,w*1.5],[59,3*h,w*1.5],[63,3*h,w*1.5],
    [41,6*h,w*1.5],[53,6*h,w*1.5],[57,6*h,w*1.5],[64,6*h,w*1.5],
    [40,9*h,w*1.5],[52,9*h,w*1.5],[59,9*h,w*1.5],[64,9*h,w*1.5],
    [43,12*h,w*1.5],[55,12*h,w*1.5],[59,12*h,w*1.5],[64,12*h,w*1.5],
    [40,15*h,w*1.5],[52,15*h,w*1.5],[59,15*h,w*1.5],[64,15*h,w*1.5],
    [41,18*h,w*1.5],[53,18*h,w*1.5],[57,18*h,w*1.5],[64,18*h,w*1.5],
    [43,21*h,w*1.5],[55,21*h,w*1.5],[59,21*h,w*1.5],[64,21*h,w*1.5],
    [40,24*h,w*1.5],[52,24*h,w*1.5],[59,24*h,w*1.5],[64,24*h,w*1.5],
  ].map((r) => [r[0], r[1], (r[2] as number) * 0.85, 60, 1]) as Row[];

  return buildFromRows("Prelude in E minor (Op.28 No.4) - Chopin", melody.concat(bass));
}

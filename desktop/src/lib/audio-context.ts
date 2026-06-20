// AudioContext  + unlock?AudioContext /

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**  ctx resume? */
export function unlock(): AudioContext | null {
  const c = getAudioContext();
  if (!c) return null;
  if (c.state === "suspended") c.resume().catch(() => {});
  return c;
}

export function nowInAudio(): number {
  return ctx ? ctx.currentTime : 0;
}

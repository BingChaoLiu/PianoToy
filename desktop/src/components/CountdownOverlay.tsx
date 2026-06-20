// CountdownOverlay: 3-2-1-Go countdown before practice starts.

import { useEffect, useState, useCallback } from "react";
import { useT } from "@/lib/i18n";

interface Props {
  active: boolean;
  onComplete: () => void;
  bpm?: number;
}

const BEAT_MS = 600;

export function CountdownOverlay({ active, onComplete, bpm }: Props) {
  const t = useT();
  const [count, setCount] = useState(3);

  const stableOnComplete = useCallback(() => onComplete, [onComplete]);

  useEffect(() => {
    if (!active) {
      setCount(3);
      return;
    }
    setCount(3);
    const beatMs = bpm ? Math.round(60000 / bpm) : BEAT_MS;
    const t1 = setTimeout(() => setCount(2), beatMs);
    const t2 = setTimeout(() => setCount(1), beatMs * 2);
    const t3 = setTimeout(() => {
      setCount(0);
      stableOnComplete()();
    }, beatMs * 3);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active, bpm, stableOnComplete]);

  if (!active) return null;

  const display = count > 0 ? String(count) : t("countdown.go");
  const isGo = count === 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div
        className={
          "rounded-full border-4 " +
          (isGo
            ? "h-24 w-24 border-green-400 bg-green-400/20 text-green-400"
            : "h-24 w-24 border-accent bg-accent/20 text-accent") +
          " flex items-center justify-center text-5xl font-black transition-all duration-300"
        }
      >
        {display}
      </div>
    </div>
  );
}

// Window-level drag-drop overlay. Uses browser DragEvent (WebView2 supports it).

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { LoadedMidi } from "@/types/midi";

interface Props {
  onFiles?: (files: LoadedMidi[]) => void;
}

export function DropOverlay({ onFiles }: Props) {
  const t = useT();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let counter = 0;
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      counter++;
      setDragging(true);
    };
    const onLeave = () => {
      counter = Math.max(0, counter - 1);
      if (counter === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      const midis = files.filter((f) => /\.(mid|midi)$/i.test(f.name));
      if (midis.length === 0) return;
      const loaded: LoadedMidi[] = await Promise.all(
        midis.map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      onFiles?.(loaded);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  if (!dragging) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-bg-0/80 backdrop-blur">
      <div className="rounded-lg border-2 border-dashed border-accent px-12 py-8 text-center">
        <p className="text-base font-semibold text-accent">{t("drop.title")}</p>
        <p className="mt-1 text-xs text-muted">{t("drop.hint")}</p>
      </div>
    </div>
  );
}

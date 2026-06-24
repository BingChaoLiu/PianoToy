// Window-level drag-drop overlay. Uses browser DragEvent (WebView2 supports it).

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { LoadedMidi } from "@/types/midi";
import { isTauriRuntime } from "@/lib/native-midi";

interface Props {
  onFiles?: (files: LoadedMidi[]) => void;
}

export function DropOverlay({ onFiles }: Props) {
  const t = useT();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (isTauriRuntime()) {
      let active = true;
      const cleanupFns: Array<() => void> = [];

      const setupTauri = async () => {
        const { listen } = await import("@tauri-apps/api/event");
        const { invoke } = await import("@tauri-apps/api/core");

        if (!active) return;

        const unEnter = await listen<{ paths: string[] }>("tauri://drag-enter", (e) => {
          if (document.getElementById("import-dialog")) return;
          const hasMidi = e.payload.paths?.some((p) => /\.mid[ia]?$/i.test(p));
          if (hasMidi) {
            setDragging(true);
          }
        });
        if (!active) { unEnter(); return; }
        cleanupFns.push(unEnter);

        const unLeave = await listen("tauri://drag-leave", () => {
          setDragging(false);
        });
        if (!active) { unLeave(); return; }
        cleanupFns.push(unLeave);

        const unDrop = await listen<{ paths: string[] }>("tauri://drag-drop", async (e) => {
          setDragging(false);
          if (document.getElementById("import-dialog")) return;
          const midis = e.payload.paths?.filter((p) => /\.mid[ia]?$/i.test(p)) ?? [];
          if (midis.length === 0) return;
          try {
            const loaded = await Promise.all(
              midis.map(async (path) => {
                const bytes: Uint8Array = await invoke("read_midi_bytes", { path });
                const name = path.split(/[\\/]/).pop() ?? path;
                return { name, bytes };
              })
            );
            onFiles?.(loaded);
          } catch (err) {
            console.error("Failed to read dropped midi files in Tauri:", err);
          }
        });
        if (!active) { unDrop(); return; }
        cleanupFns.push(unDrop);
      };

      setupTauri();

      return () => {
        active = false;
        cleanupFns.forEach((un) => un());
      };
    }

    let counter = 0;
    const onEnter = (e: DragEvent) => {
      if (document.getElementById("import-dialog")) return;
      if (!e.dataTransfer?.types.includes("Files")) return;
      counter++;
      setDragging(true);
    };
    const onLeave = () => {
      counter = Math.max(0, counter - 1);
      if (counter === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (document.getElementById("import-dialog")) return;
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setDragging(false);
      if (document.getElementById("import-dialog")) return;
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

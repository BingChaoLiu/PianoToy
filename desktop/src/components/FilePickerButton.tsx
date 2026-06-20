// File picker: Tauri native dialog (production) with web <input type=file> fallback.

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useT } from "@/lib/i18n";
import type { LoadedMidi } from "@/types/midi";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface Props {
  onFile: (file: LoadedMidi) => void;
}

export function FilePickerButton({ onFile }: Props) {
  const t = useT();
  const handleClick = useCallback(async () => {
    if (isTauri) {
      try {
        const selected = await openDialog({
          multiple: false,
          filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
        });
        if (!selected) return;
        const path = typeof selected === "string" ? selected : selected[0];
        if (!path) return;
        const bytes: Uint8Array = await invoke("read_midi_bytes", { path });
        const name = path.split(/[\\/]/).pop() ?? path;
        onFile({ name, bytes });
      } catch (err) {
        console.error("[FilePickerButton] tauri open failed", err);
      }
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".mid,.midi";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const bytes = new Uint8Array(await f.arrayBuffer());
      onFile({ name: f.name, bytes });
    };
    input.click();
  }, [onFile]);

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      {t("header.load_mid")}
    </Button>
  );
}

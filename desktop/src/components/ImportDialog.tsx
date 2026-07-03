import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { isTauriRuntime } from "@/lib/native-midi";
import { inferFormatFromName, type ScoreSourceFormat } from "@/lib/score-parser";

export interface ImportDialogResult {
  /** Raw score bytes (MIDI or MusicXML). */
  sourceBytes: Uint8Array;
  sourceName: string;
  /** Detected format from the file extension. */
  sourceFormat: ScoreSourceFormat;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: ImportDialogResult) => Promise<void> | void;
}

interface FileSlot {
  bytes: Uint8Array;
  name: string;
  format: ScoreSourceFormat;
}

function readFile(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((ab) => new Uint8Array(ab));
}

export function ImportDialog({ open, onClose, onConfirm }: Props) {
  const t = useT();
  const [source, setSource] = useState<FileSlot | null>(null);
  const [name, setName] = useState("");
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);
    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!isTauriRuntime()) return;

    let active = true;
    const cleanupFns: Array<() => void> = [];

    const setupListeners = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { invoke } = await import("@tauri-apps/api/core");

      if (!active) return;

      const overZone = (lx: number, ly: number) => {
        const rect = zoneRef.current?.getBoundingClientRect();
        return !!(
          rect &&
          lx >= rect.left &&
          lx <= rect.right &&
          ly >= rect.top &&
          ly <= rect.bottom
        );
      };

      const unEnter = await listen<{ paths: string[]; position: { x: number; y: number } }>(
        "tauri://drag-enter",
        async (e) => {
          const { x, y } = e.payload.position;
          const sf = await getCurrentWindow().scaleFactor();
          setDragOver(overZone(x / sf, y / sf));
        }
      );
      if (!active) { unEnter(); return; }
      cleanupFns.push(unEnter);

      const unOver = await listen<{ position: { x: number; y: number } }>(
        "tauri://drag-over",
        async (e) => {
          const { x, y } = e.payload.position;
          const sf = await getCurrentWindow().scaleFactor();
          setDragOver(overZone(x / sf, y / sf));
        }
      );
      if (!active) { unOver(); return; }
      cleanupFns.push(unOver);

      const unLeave = await listen("tauri://drag-leave", () => {
        setDragOver(false);
      });
      if (!active) { unLeave(); return; }
      cleanupFns.push(unLeave);

      const unDrop = await listen<{ paths: string[]; position: { x: number; y: number } }>(
        "tauri://drag-drop",
        async (e) => {
          setDragOver(false);
          const { x, y } = e.payload.position;
          const sf = await getCurrentWindow().scaleFactor();
          const lx = x / sf;
          const ly = y / sf;

          if (!overZone(lx, ly)) return;

          const path = e.payload.paths?.[0];
          if (!path) return;
          const fileName = path.split(/[\\/]/).pop() ?? path;
          const fmt = inferFormatFromName(fileName);
          if (!fmt) {
            setError(t("import_dialog.midi_required"));
            return;
          }
          try {
            const bytes: Uint8Array = await invoke("read_midi_bytes", { path });
            setSource({ bytes, name: fileName, format: fmt });
            setName((n) => n || fileName.replace(/\.[^.]+$/, ""));
            setError(null);
          } catch (err) {
            setError(String(err));
          }
        }
      );
      if (!active) { unDrop(); return; }
      cleanupFns.push(unDrop);
    };

    setupListeners();

    return () => {
      active = false;
      cleanupFns.forEach((un) => un());
    };
  }, [open, t]);

  const reset = useCallback(() => {
    setSource(null);
    setName("");
    setError(null);
    setDragOver(false);
    setBusy(false);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, onClose, reset]);

  const pickSource = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      const fmt = inferFormatFromName(file.name);
      if (!fmt) {
        setError(t("import_dialog.midi_required"));
        return;
      }
      const bytes = await readFile(file);
      setSource({ bytes, name: file.name, format: fmt });
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      setError(null);
    },
    [name, t],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      pickSource(file);
    },
    [pickSource],
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const submitImport = useCallback(async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        sourceBytes: source.bytes,
        sourceName: source.name,
        sourceFormat: source.format,
        name: name.trim() || source.name.replace(/\.[^.]+$/, ""),
      });
      reset();
      onClose();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }, [source, name, onConfirm, onClose, reset]);

  if (!open) return null;

  const zoneClass = (filled: boolean, active: boolean) => {
    let colorClasses = "border-bg-3 bg-bg-2";
    if (active) {
      colorClasses = "border-blue-500 bg-blue-500/10";
    } else if (filled) {
      colorClasses = "border-green-500/60 bg-green-500/5";
    }
    return [
      "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
      colorClasses,
    ].join(" ");
  };

  return (
    <div
      id="import-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleClose}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        className="w-[min(92vw,560px)] rounded-xl border border-bg-3 bg-bg-1 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{t("import_dialog.title")}</h2>

        <div>
          {/* Score zone: accepts MIDI or MusicXML (required) */}
          <div
            ref={zoneRef}
            className={zoneClass(!!source, dragOver)}
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={() => setDragOver(false)}
          >
            <div className="text-sm font-medium pointer-events-none">{t("import_dialog.midi_zone")}</div>
            <div className="mt-1 text-xs text-muted pointer-events-none">{t("import_dialog.midi_zone_hint")}</div>
            <div className="mt-2 truncate text-xs text-green-400 pointer-events-none">
              {dragOver ? t("import_dialog.release_to_drop") : source?.name}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".mid,.midi,.musicxml,.xml"
              className="hidden"
              onChange={(e) => pickSource(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs text-muted">{t("import_dialog.name_label")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-full rounded border border-bg-3 bg-bg-2 px-2 text-sm text-fg outline-none focus:border-accent"
          />
        </div>

        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={busy}>
            {t("import_dialog.cancel")}
          </Button>
          <Button size="sm" onClick={submitImport} disabled={!source || busy}>
            {t("import_dialog.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

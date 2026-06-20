// Import dialog with two drop zones (MIDI required, PDF optional) and an
// editable name field. Pure presentational + callbacks; the parent performs
// the actual import via importScore().

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

export interface ImportDialogResult {
  midiBytes: Uint8Array;
  midiName: string;
  pdfBytes: Uint8Array | null;
  pdfName: string | null;
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
}

function readFile(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((ab) => new Uint8Array(ab));
}

export function ImportDialog({ open, onClose, onConfirm }: Props) {
  const t = useT();
  const [midi, setMidi] = useState<FileSlot | null>(null);
  const [pdf, setPdf] = useState<FileSlot | null>(null);
  const [name, setName] = useState("");
  const [dragOver, setDragOver] = useState<"midi" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const midiInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setMidi(null);
    setPdf(null);
    setName("");
    setError(null);
    setDragOver(null);
    setBusy(false);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, onClose, reset]);

  const pickMidi = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!/\.mid[ia]?$/i.test(file.name)) {
        setError(t("import_dialog.midi_required"));
        return;
      }
      const bytes = await readFile(file);
      setMidi({ bytes, name: file.name });
      if (!name) setName(file.name.replace(/\.(mid|midi)$/i, ""));
      setError(null);
    },
    [name, t],
  );

  const pickPdf = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!/\.pdf$/i.test(file.name)) {
        setError(t("import_dialog.pdf_required"));
        return;
      }
      if (file.size > MAX_PDF_BYTES) {
        setError(t("import_dialog.file_too_large"));
        return;
      }
      const bytes = await readFile(file);
      setPdf({ bytes, name: file.name });
      setError(null);
    },
    [t],
  );

  const onDrop = useCallback(
    (zone: "midi" | "pdf") => (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const file = e.dataTransfer.files?.[0];
      if (zone === "midi") pickMidi(file);
      else pickPdf(file);
    },
    [pickMidi, pickPdf],
  );

  const onDragOver = useCallback((zone: "midi" | "pdf") => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(zone);
  }, []);

  const submitImport = useCallback(async () => {
    if (!midi) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({
        midiBytes: midi.bytes,
        midiName: midi.name,
        pdfBytes: pdf?.bytes ?? null,
        pdfName: pdf?.name ?? null,
        name: name.trim() || midi.name.replace(/\.(mid|midi)$/i, ""),
      });
      reset();
      onClose();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }, [midi, pdf, name, onConfirm, onClose, reset]);

  if (!open) return null;

  const zoneClass = (filled: boolean, active: boolean) =>
    [
      "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
      filled ? "border-green-500/60 bg-green-500/5" : "border-bg-3 bg-bg-2",
      active ? "border-blue-500 bg-blue-500/10" : "",
    ].join(" ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleClose}
    >
      <div
        className="w-[min(92vw,560px)] rounded-xl border border-bg-3 bg-bg-1 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{t("import_dialog.title")}</h2>

        <div className="grid grid-cols-2 gap-3">
          {/* MIDI zone (required) */}
          <div
            className={zoneClass(!!midi, dragOver === "midi")}
            onClick={() => midiInputRef.current?.click()}
            onDrop={onDrop("midi")}
            onDragOver={onDragOver("midi")}
            onDragLeave={() => setDragOver(null)}
          >
            <div className="text-sm font-medium">{t("import_dialog.midi_zone")}</div>
            <div className="mt-1 text-xs text-muted">{t("import_dialog.midi_zone_hint")}</div>
            <div className="mt-2 truncate text-xs text-green-400">
              {dragOver === "midi" ? t("import_dialog.release_to_drop") : midi?.name}
            </div>
            <input
              ref={midiInputRef}
              type="file"
              accept=".mid,.midi"
              className="hidden"
              onChange={(e) => pickMidi(e.target.files?.[0])}
            />
          </div>

          {/* PDF zone (optional) */}
          <div
            className={zoneClass(!!pdf, dragOver === "pdf")}
            onClick={() => pdfInputRef.current?.click()}
            onDrop={onDrop("pdf")}
            onDragOver={onDragOver("pdf")}
            onDragLeave={() => setDragOver(null)}
          >
            <div className="text-sm font-medium">
              {t("import_dialog.pdf_zone")}{" "}
              <span className="text-xs text-muted">({t("import_dialog.pdf_optional")})</span>
            </div>
            <div className="mt-1 text-xs text-muted">{t("import_dialog.pdf_zone_hint")}</div>
            <div className="mt-2 truncate text-xs text-green-400">
              {dragOver === "pdf" ? t("import_dialog.release_to_drop") : pdf?.name}
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => pickPdf(e.target.files?.[0])}
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
          <Button size="sm" onClick={submitImport} disabled={!midi || busy}>
            {t("import_dialog.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

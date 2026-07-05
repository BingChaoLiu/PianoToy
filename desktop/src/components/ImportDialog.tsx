import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { isTauriRuntime } from "@/lib/native-midi";
import { inferFormatFromName, type ScoreSourceFormat } from "@/lib/score-parser";
import type { ConvertStage } from "@/lib/midi-converter";

export interface ImportDialogResult {
  /** Raw score bytes (MIDI or MusicXML). */
  sourceBytes: Uint8Array;
  sourceName: string;
  /** Detected format from the file extension. */
  sourceFormat: ScoreSourceFormat;
  name: string;
  /**
   * Only meaningful when sourceFormat === "midi": whether the user opted to
   * run the webmscore MIDI→MusicXML conversion at import time so the score
   * gains a sheet-music view. Default true (the box is pre-checked). Ignored
   * for MusicXML imports (they already have sheet music).
   */
  generateMusicXml: boolean;
}

/**
 * Hooks the parent handler can use to drive the dialog's inline progress UI.
 * `onStage` is called during conversion (loading-converter → converting).
 */
export interface ImportDialogHooks {
  onStage?: (stage: ConvertStage) => void;
}

/** Outcome of an import. ok=false surfaces the error inline + lets the user
 *  choose to continue without the converted sheet music. */
export interface ImportOutcome {
  ok: boolean;
  /** When ok=false, a human-readable error string to show inline. */
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Run the import (parse + save + optional conversion). The dialog stays open
   * showing inline progress until the returned promise settles.
   *   - ok=true  → dialog closes, parent navigates.
   *   - ok=false → dialog switches to the convert-error phase with a
   *                "Continue without sheet music" affordance.
   */
  onConfirm: (
    result: ImportDialogResult,
    hooks: ImportDialogHooks,
  ) => Promise<ImportOutcome>;
}

interface FileSlot {
  bytes: Uint8Array;
  name: string;
  format: ScoreSourceFormat;
}

function readFile(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((ab) => new Uint8Array(ab));
}

type DialogPhase = "form" | "converting" | "convert-error";

export function ImportDialog({ open, onClose, onConfirm }: Props) {
  const t = useT();
  const [source, setSource] = useState<FileSlot | null>(null);
  const [name, setName] = useState("");
  // Default ON so MIDI imports gain sheet music unless the user unchecks.
  // Reset to true whenever the dialog opens (a previous uncheck shouldn't
  // leak into the next import session).
  const [generateMusicXml, setGenerateMusicXml] = useState(true);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  // Inline-conversion UI state. While `phase === "converting"`, the form is
  // hidden and a spinner + stage label is shown. On a failed outcome the
  // parent returns {ok:false, error} and we flip to "convert-error" with a
  // "Continue without sheet music" affordance.
  const [phase, setPhase] = useState<DialogPhase>("form");
  const [convertStage, setConvertStage] = useState<ConvertStage | null>(null);
  const [convertError, setConvertError] = useState<string>("");
  // Hold the last result so the "Continue without sheet music" button can
  // re-submit with generateMusicXml=false without the user re-picking a file.
  const lastResultRef = useRef<ImportDialogResult | null>(null);

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
            // Tauri's read_midi_bytes returns a plain number[], not a typed
            // array — wrap it so downstream code (TextDecoder, parseSmf) gets
            // a real Uint8Array. (invoke is typed as number[] in lib.rs.)
            const arr = await invoke<number[]>("read_midi_bytes", { path });
            const bytes = new Uint8Array(arr);
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
    setGenerateMusicXml(true);
    setPhase("form");
    setConvertStage(null);
    setConvertError("");
    lastResultRef.current = null;
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
    const result: ImportDialogResult = {
      sourceBytes: source.bytes,
      sourceName: source.name,
      sourceFormat: source.format,
      name: name.trim() || source.name.replace(/\.[^.]+$/, ""),
      // For MIDI imports the conversion runs in the parent handler. For
      // MusicXML imports the field is ignored — the bytes are already
      // engraving source.
      generateMusicXml: source.format === "midi" ? generateMusicXml : false,
    };
    lastResultRef.current = result;
    // Switch the dialog body to the inline progress surface BEFORE handing
    // control to the parent, so the user sees "Loading converter…" / "Converting…"
    // instead of the now-disabled form. Skipped when no conversion will run
    // (MusicXML import, or the box unchecked) — the dialog just stays on the
    // form with a busy indicator for the brief save step.
    const willConvert = result.generateMusicXml;
    if (willConvert) {
      setPhase("converting");
      setConvertStage("loading-converter");
    }
    try {
      const outcome = await onConfirm(result, {
        onStage: (s) => setConvertStage(s),
      });
      if (outcome.ok) {
        reset();
        onClose();
        return;
      }
      // Failure: surface inline + offer "Continue without sheet music".
      setBusy(false);
      if (willConvert) {
        setConvertError(outcome.error ?? t("import_dialog.conversion_failed"));
        setPhase("convert-error");
      } else {
        // Non-conversion failure (e.g. parse error) — back to the form.
        setError(outcome.error ?? t("import_dialog.conversion_failed"));
        setPhase("form");
      }
    } catch (err) {
      // Defensive: the parent should always return an outcome, but guard.
      setBusy(false);
      setError(String(err));
      setPhase("form");
    }
  }, [source, name, generateMusicXml, onConfirm, onClose, reset, t]);

  /** "Continue without sheet music" from the convert-error phase: re-run the
   *  parent handler with generateMusicXml=false. The score is already saved
   *  (MIDI-only), so this just finishes loading + navigates. */
  const continueWithoutSheetMusic = useCallback(async () => {
    const last = lastResultRef.current;
    if (!last) {
      reset();
      onClose();
      return;
    }
    const midiOnly: ImportDialogResult = { ...last, generateMusicXml: false };
    setBusy(true);
    setPhase("form");
    setError(null);
    try {
      const outcome = await onConfirm(midiOnly, { onStage: () => {} });
      if (outcome.ok) {
        reset();
        onClose();
      } else {
        setBusy(false);
        setError(outcome.error ?? t("import_dialog.conversion_failed"));
      }
    } catch (err) {
      setBusy(false);
      setError(String(err));
    }
  }, [onConfirm, onClose, reset, t]);

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
        {phase === "converting" && (
          <ConvertingBody stage={convertStage} name={name} />
        )}

        {phase === "convert-error" && (
          <ConvertErrorBody
            error={convertError}
            onContinue={continueWithoutSheetMusic}
            onClose={handleClose}
            busy={busy}
          />
        )}

        {phase === "form" && (
          <>
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

            {/* MIDI-only: offer to generate a sheet-music view (MusicXML) via the
                webmscore WASM converter. Hidden for MusicXML imports — those
                already ARE the engraving source. */}
            {source?.format === "midi" && (
              <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-md border border-bg-3 bg-bg-2/50 p-3">
                <input
                  type="checkbox"
                  checked={generateMusicXml}
                  onChange={(e) => setGenerateMusicXml(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-500"
                />
                <span className="select-none">
                  <span className="block text-sm text-fg">{t("import_dialog.generate_musicxml")}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t("import_dialog.generate_musicxml_hint")}
                  </span>
                </span>
              </label>
            )}

            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={busy}>
                {t("import_dialog.cancel")}
              </Button>
              <Button size="sm" onClick={submitImport} disabled={!source || busy}>
                {busy ? t("import_dialog.importing") : t("import_dialog.confirm")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Inline progress surface shown while the conversion runs in the parent. */
function ConvertingBody({ stage, name }: { stage: ConvertStage | null; name: string }) {
  const t = useT();
  const label =
    stage === "loading-converter"
      ? t("import_dialog.stage_loading_converter")
      : t("import_dialog.stage_converting");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      {/* Pure-CSS spinner — no extra icon dependency. */}
      <span
        className="h-9 w-9 animate-spin rounded-full border-2 border-bg-3 border-t-blue-500"
        aria-hidden
      />
      <div className="text-sm font-medium text-fg">{label}</div>
      {name && <div className="text-xs text-muted">{name}</div>}
      <div className="max-w-sm text-xs text-muted">
        {stage === "loading-converter"
          ? t("import_dialog.stage_loading_converter_hint")
          : t("import_dialog.stage_converting_hint")}
      </div>
    </div>
  );
}

/** Error surface with a graceful "continue without sheet music" affordance.
 *  The MIDI score is already saved, so continuing loads it MIDI-only. */
function ConvertErrorBody({
  error,
  onContinue,
  onClose,
  busy,
}: {
  error: string;
  onContinue: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="text-sm font-medium text-red-400">{t("import_dialog.conversion_failed")}</div>
      <div className="max-w-sm text-xs text-muted">{error}</div>
      <div className="mt-2 flex justify-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          {t("import_dialog.cancel")}
        </Button>
        <Button size="sm" onClick={onContinue} disabled={busy}>
          {t("import_dialog.continue_without_sheet_music")}
        </Button>
      </div>
    </div>
  );
}

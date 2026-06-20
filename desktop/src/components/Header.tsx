// Header: file picker, record, replay, save, settings.

import { Settings, Circle, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePickerButton } from "@/components/FilePickerButton";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useRecordingStore } from "@/store/useRecordingStore";
import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { encodeSmf } from "@/lib/smf-writer";
import { useT } from "@/lib/i18n";
import type { LoadedMidi } from "@/types/midi";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface Props {
  onOpenSettings: () => void;
  onFile: (file: LoadedMidi) => void;
}

export function Header({ onOpenSettings, onFile }: Props) {
  const t = useT();

  const isRecording = useRecordingStore((s) => s.isRecording);
  const lastRecording = useRecordingStore((s) => s.lastRecording);
  const recToggle = useRecordingStore((s) => s.toggle);
  const recClearLast = useRecordingStore((s) => s.clearLast);

  const handleRecToggle = () => {
    recToggle();
  };

  const handleReplay = () => {
    const rec = useRecordingStore.getState().lastRecording;
    if (!rec) return;
    useSongStore.getState().loadSong(rec);
    requestAnimationFrame(() => usePlaybackStore.getState().play(rec));
  };

  const handleSave = async () => {
    const rec = useRecordingStore.getState().lastRecording;
    if (!rec) return;
    const bytes = encodeSmf(rec.notes);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `piano-recording-${ts}.mid`;

    if (isTauri) {
      try {
        const path = await saveDialog({
          defaultPath: filename,
          filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
        });
        if (!path) return;
        await invoke("save_midi_bytes", { path, bytes: Array.from(bytes) });
      } catch (err) {
        console.error("[Header] save failed", err);
      }
      return;
    }
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const blob = new Blob([ab], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const recStopped = !isRecording;
  if (!recStopped && lastRecording) {
    queueMicrotask(() => recClearLast());
  }

  return (
    <div className="flex items-center gap-2 flex-1 justify-end">
      <FilePickerButton onFile={onFile} />

      <Button
        variant={isRecording ? "destructive" : "outline"}
        size="sm"
        onClick={handleRecToggle}
        title={isRecording ? t("header.stop_recording_tip") : t("header.start_recording_tip")}
      >
        <Circle
          className={`h-3 w-3 ${isRecording ? "animate-pulse" : ""}`}
          fill={isRecording ? "currentColor" : "none"}
        />
        {isRecording ? t("header.stop") : t("header.recording")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleReplay}
        disabled={!lastRecording || isRecording}
        title={t("header.replay_tip")}
      >
        <Play className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSave}
        disabled={!lastRecording || isRecording}
        title={t("header.save_midi_tip")}
      >
        <Save className="h-3 w-3" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSettings}
        title={t("header.settings_tip")}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
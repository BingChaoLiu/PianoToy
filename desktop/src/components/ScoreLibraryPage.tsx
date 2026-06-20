// ScoreLibraryPage: browse and select scores for practice.

import { useState, useMemo } from "react";
import { ArrowLeft, Search, FileUp, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useScoreLibraryStore, type ScoreEntry } from "@/store/useScoreLibraryStore";
import { useSongStore } from "@/store/useSongStore";
import { useT } from "@/lib/i18n";
import { SCORE_CATALOG, CATEGORIES, DIFFICULTIES } from "@/lib/songs/catalog";
import { parseSmf } from "@/lib/smf-parser";
import { loadMidi, deleteMidi } from "@/lib/midi-storage";
import { importScore, loadScoreMidi, deleteScore } from "@/lib/score-storage";
import { ImportDialog, type ImportDialogResult } from "@/components/ImportDialog";
import { toast } from "sonner";


interface Props {
  onSongSelected?: () => void;
}

export function ScoreLibraryPage({ onSongSelected }: Props) {
  const t = useT();
  const setMode = useAppModeStore((s) => s.setMode);
  const loadSong = useSongStore((s) => s.loadSong);
  const customScores = useScoreLibraryStore((s) => s.customScores);
  const removeCustomScore = useScoreLibraryStore((s) => s.removeCustomScore);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const allScores = useMemo(() => {
    return [...SCORE_CATALOG, ...customScores];
  }, [customScores]);

  const filtered = useMemo(() => {
    return allScores.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (diffFilter !== "all" && s.difficulty !== diffFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.composer.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allScores, categoryFilter, diffFilter, searchQuery]);

  const handleSelect = async (entry: typeof SCORE_CATALOG[number]) => {
    let song;
    if (entry.build) {
      song = entry.build();
    } else if (entry.filePath) {
      // Public domain MIDI file loaded from public/midi/
      try {
        const resp = await fetch(entry.filePath);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const ab = await resp.arrayBuffer();
        const bytes = new Uint8Array(ab);
        song = parseSmf(bytes);
        song.name = entry.name;
      } catch (err) {
        toast.error(t("toast.load_failed", { msg: String(err) }));
        return;
      }
    } else {
      // Custom imported MIDI: prefer file-system storage, fall back to legacy IDB.
      try {
        let bytes = await loadScoreMidi(entry.id);
        if (!bytes) bytes = await loadMidi(entry.id);
        if (!bytes) {
          toast.error(t("toast.load_failed", { msg: "file not found" }));
          return;
        }
        song = parseSmf(bytes);
        song.name = entry.name;
      } catch (err) {
        toast.error(t("toast.load_failed", { msg: String(err) }));
        return;
      }
    }
    if (!song) return;
    loadSong(song);
    // Keep in score-practice mode; let App.tsx show mode selector
    if (onSongSelected) {
      onSongSelected();
    }
  };

  const handleImport = () => setImportOpen(true);

  const handleImportConfirm = async (r: ImportDialogResult) => {
    const song = parseSmf(r.midiBytes);
    const meta = await importScore({
      midiBytes: r.midiBytes,
      pdfBytes: r.pdfBytes,
      name: r.name,
      composer: t("score.custom"),
      difficulty: "medium",
      duration: Math.round(song.duration),
      noteCount: song.notes.length,
      tempo: 120,
      timeSignature: "4/4",
    });
    await useScoreLibraryStore.getState().rescan();
    song.name = meta.name;
    loadSong(song);
    if (onSongSelected) onSongSelected();
    toast.success(t("toast.loaded", { name: meta.name, n: song.notes.length }));
  };

  const handleDelete = async (entry: ScoreEntry) => {
    if (!confirm(t("score_delete.confirm"))) return;
    removeCustomScore(entry.id);
    // Delete from the file system if present; always best-effort clean the
    // legacy IDB too (the two stores are independent and non-overlapping, so
    // cleaning both is safe and avoids orphaned legacy blobs).
    try {
      await deleteScore(entry.id);
    } catch {
      // folder doesn't exist on disk (legacy-only entry) — that's fine
    }
    await deleteMidi(entry.id).catch(() => {});
    toast.success(t("score_delete.delete"));
  };

  const isCustomEntry = (entry: ScoreEntry): boolean => {
    return !entry.build && entry.category === "custom";
  };

  const diffColor = (d: string) => {
    switch (d) {
      case "easy": return "text-green-400";
      case "medium": return "text-yellow-400";
      case "hard": return "text-red-400";
      default: return "text-muted";
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-4 border-b border-bg-2 px-6 py-3">
        <Button variant="ghost" size="icon" onClick={() => setMode("home")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold text-fg">{t("score.title")}</h1>
        <div className="ml-auto flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("score.search")}
              className="rounded border border-bg-3 bg-bg-2 py-1 pl-7 pr-3 text-xs text-fg placeholder:text-muted"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <FileUp className="mr-1 h-3 w-3" />
            {t("score.import")}
          </Button>
        </div>
      </header>

      <div className="flex gap-4 border-b border-bg-2 px-6 py-2">
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={"rounded px-2 py-1 text-xs transition-colors " + (categoryFilter === c.id ? "bg-accent text-bg-0" : "bg-bg-2 text-muted hover:text-fg")}
            >
              {t(c.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDiffFilter(d.id)}
              className={"rounded px-2 py-1 text-xs transition-colors " + (diffFilter === d.id ? "bg-accent text-bg-0" : "bg-bg-2 text-muted hover:text-fg")}
            >
              {t(d.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {filtered.map((entry) => {
            const custom = isCustomEntry(entry);
            return (
            <div
              key={entry.id}
              className="relative flex flex-col gap-2 rounded-lg border border-bg-2 bg-bg-1 p-4 text-left transition-colors hover:border-accent/40"
            >
              <button
                onClick={() => handleSelect(entry)}
                className="flex flex-1 flex-col gap-2 text-left"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-1.5">
                    {custom && <User className="h-3 w-3 shrink-0 text-accent/60" />}
                    <h3 className="text-sm font-medium text-fg leading-snug">{entry.name}</h3>
                  </div>
                  <span className={"ml-2 shrink-0 text-[10px] " + diffColor(entry.difficulty)}>
                    {t("score.diff_" + entry.difficulty)}
                  </span>
                </div>
                <span className="text-xs text-muted">{entry.composer}</span>
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <span>{Math.round(entry.duration / 60)}:{String(Math.round(entry.duration % 60)).padStart(2, "0")}</span>
                  <span>{t("score.category_" + entry.category)}</span>
                </div>
              </button>
              {custom && (
                <button
                  onClick={() => handleDelete(entry)}
                  className="absolute right-2 top-2 rounded p-1 text-muted hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  title={t("score_delete.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted">{t("score.no_results")}</div>
        )}
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={handleImportConfirm}
      />
    </div>
  );
}

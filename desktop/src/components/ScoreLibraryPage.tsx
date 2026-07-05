// ScoreLibraryPage: browse and select scores for practice.

import { useState, useMemo, useRef } from "react";
import { ArrowLeft, Search, FileUp, Trash2, User, LayoutGrid, List, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppModeStore } from "@/store/useAppModeStore";
import { useScoreLibraryStore, type ScoreEntry } from "@/store/useScoreLibraryStore";
import { useScoreLibraryPrefsStore } from "@/store/useScoreLibraryPrefsStore";
import { useSongStore } from "@/store/useSongStore";
import { useT } from "@/lib/i18n";
import { SCORE_CATALOG, CATEGORIES, DIFFICULTIES } from "@/lib/songs/catalog";
import { parseScore, type ScoreSourceFormat } from "@/lib/score-parser";
import { loadMidi, deleteMidi } from "@/lib/midi-storage";
import { importScore, loadScoreMidi, loadScoreMusicXml, deleteScore, appendMusicXml } from "@/lib/score-storage";
import { ImportDialog, type ImportDialogResult, type ImportDialogHooks, type ImportOutcome } from "@/components/ImportDialog";
import { convertMidiToMusicXml } from "@/lib/midi-converter";
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
  const { viewMode, favorites, setViewMode, toggleFavorite } = useScoreLibraryPrefsStore();

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const allScores = useMemo(() => {
    return [...SCORE_CATALOG, ...customScores];
  }, [customScores]);

  const filteredAndSorted = useMemo(() => {
    const filteredScores = allScores.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (diffFilter !== "all" && s.difficulty !== diffFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.composer.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Favorites at the top (head) of the list
    return [...filteredScores].sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 1 : 0;
      const bFav = favorites.includes(b.id) ? 1 : 0;
      return bFav - aFav;
    });
  }, [allScores, categoryFilter, diffFilter, searchQuery, favorites]);

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
        song = await parseScore(bytes, "midi");
        song.name = entry.name;
      } catch (err) {
        toast.error(t("toast.load_failed", { msg: String(err) }));
        return;
      }
    } else {
      // Custom imported score: dispatch on source format.
      // MusicXML scores read score.musicxml; MIDI scores read song.mid
      // (file-system first, legacy IDB fallback).
      try {
        const fmt: ScoreSourceFormat =
          (entry as ScoreEntry).sourceFormat === "musicxml" ? "musicxml" : "midi";
        let bytes: Uint8Array | null = null;
        if (fmt === "musicxml") {
          bytes = await loadScoreMusicXml(entry.id);
        } else {
          bytes = await loadScoreMidi(entry.id);
          if (!bytes) bytes = await loadMidi(entry.id);
        }
        if (!bytes) {
          toast.error(t("toast.load_failed", { msg: "file not found" }));
          return;
        }
        song = await parseScore(bytes, fmt);
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

  // Track which score folder was already created during this dialog session,
  // so the "Continue without sheet music" re-entry (after a conversion
  // failure) doesn't try to re-import the same MIDI and create a duplicate.
  // Cleared whenever the dialog closes (rescan + navigation re-seeds state).
  const lastImportedFolderRef = useRef<string | null>(null);

  const handleImportConfirm = async (
    r: ImportDialogResult,
    hooks: ImportDialogHooks,
  ): Promise<ImportOutcome> => {
    // MusicXML parses through Verovio (async); MIDI parses synchronously.
    let song;
    try {
      song = await parseScore(r.sourceBytes, r.sourceFormat);
    } catch (err) {
      return { ok: false, error: t("toast.load_failed", { msg: String(err) }) };
    }

    // Persist the score (MIDI-only, or MIDI+MusicXML for a direct MusicXML
    // import). Skip if we already saved it during this dialog session — that
    // happens when "Continue without sheet music" re-enters after a failed
    // conversion; the folder + MIDI already exist.
    let folderId = lastImportedFolderRef.current;
    if (!folderId) {
      const meta = await importScore({
        midiBytes: r.sourceBytes,
        musicXmlBytes: r.sourceFormat === "musicxml" ? r.sourceBytes : null,
        name: r.name,
        composer: t("score.custom"),
        difficulty: "medium",
        duration: Math.round(song.duration),
        noteCount: song.notes.length,
        tempo: 120,
        timeSignature: "4/4",
        sourceFormat: r.sourceFormat,
      });
      folderId = meta.id;
      lastImportedFolderRef.current = folderId;
      await useScoreLibraryStore.getState().rescan();
    }

    // Optional: convert MIDI → MusicXML via webmscore so the score gains a
    // sheet-music view. The dialog shows inline progress via hooks.onStage.
    // On failure we bail with {ok:false} so the dialog offers "Continue
    // without sheet music" — the MIDI score is already saved either way.
    if (r.generateMusicXml) {
      // Copy the bytes — the worker takes ownership (transfers the buffer).
      const midiCopy = new Uint8Array(r.sourceBytes);
      try {
        const xml = await convertMidiToMusicXml(midiCopy, {
          onStage: (stage) => hooks.onStage?.(stage),
        });
        await appendMusicXml(folderId, new TextEncoder().encode(xml));
        await useScoreLibraryStore.getState().rescan();
        toast.success(t("toast.musicxml_generated", { name: r.name }));
      } catch (err) {
        console.error("[import] MIDI→MusicXML conversion failed", err);
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Everything ready — load the song + navigate. This runs LAST so the
    // dialog stays on the progress surface until the conversion (if any)
    // completes, then closes into the mode-selection screen.
    await useScoreLibraryStore.getState().rescan();
    const freshMeta = useScoreLibraryStore.getState().customScores.find(
      (e) => e.id === folderId,
    );
    song.name = freshMeta?.name ?? r.name;
    loadSong(song);
    if (onSongSelected) onSongSelected();
    toast.success(t("toast.loaded", { name: song.name, n: song.notes.length }));
    lastImportedFolderRef.current = null;
    return { ok: true };
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

  const diffBadgeClass = (d: string) => {
    switch (d) {
      case "easy": return "bg-green-500/10 text-green-400 border-green-500/20";
      case "medium": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "hard": return "bg-red-500/10 text-red-400 border-red-500/20";
      default: return "bg-bg-2 text-muted border-bg-2";
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
          <div className="flex items-center border border-bg-3 rounded bg-bg-2 p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={`rounded p-1 transition-colors ${viewMode === "grid" ? "bg-accent text-bg-0" : "text-muted hover:text-fg"}`}
              title={t("score.grid_view")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`rounded p-1 transition-colors ${viewMode === "list" ? "bg-accent text-bg-0" : "text-muted hover:text-fg"}`}
              title={t("score.list_view")}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
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
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {filteredAndSorted.map((entry) => {
              const custom = isCustomEntry(entry);
              const isFav = favorites.includes(entry.id);
              return (
                <div
                  key={entry.id}
                  className="relative flex flex-col gap-2 rounded-lg border border-bg-2 bg-bg-1 p-4 text-left transition-colors hover:border-accent/40"
                >
                  <button
                    onClick={() => handleSelect(entry)}
                    className="flex flex-1 flex-col gap-2 text-left min-w-0"
                  >
                    <div className="flex items-center justify-between w-full min-w-0 pr-14">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {custom && <User className="h-3.5 w-3.5 shrink-0 text-accent/60" />}
                        <h3 className="text-sm font-medium text-fg leading-none truncate" title={entry.name}>
                          {entry.name}
                        </h3>
                      </div>
                      <span className={`ml-2 shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-medium ${diffBadgeClass(entry.difficulty)}`}>
                        {t("score.diff_" + entry.difficulty)}
                      </span>
                    </div>
                    <span className="text-xs text-muted truncate w-full">{entry.composer}</span>
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <span>
                        {Math.round(entry.duration / 60)}:{String(Math.round(entry.duration % 60)).padStart(2, "0")}
                      </span>
                      <span>{t("score.category_" + entry.category)}</span>
                    </div>
                  </button>
                  <div className="absolute right-3 top-3.5 flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(entry.id);
                      }}
                      className="rounded p-1 text-muted hover:bg-amber-500/20 hover:text-amber-400 transition-colors"
                    >
                      <Star className={`h-3.5 w-3.5 ${isFav ? "fill-amber-400 text-amber-400" : ""}`} />
                    </button>
                    {custom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry);
                        }}
                        className="rounded p-1 text-muted hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        title={t("score_delete.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredAndSorted.map((entry) => {
              const custom = isCustomEntry(entry);
              const isFav = favorites.includes(entry.id);
              return (
                <div
                  key={entry.id}
                  className="relative flex items-center justify-between gap-4 rounded-lg border border-bg-2 bg-bg-1 p-3 text-left transition-colors hover:border-accent/40"
                >
                  <button
                    onClick={() => handleSelect(entry)}
                    className="flex flex-1 items-center gap-3 text-left min-w-0"
                  >
                    {custom && <User className="h-4 w-4 shrink-0 text-accent/60" />}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-fg truncate" title={entry.name}>
                        {entry.name}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                        <span className="truncate max-w-[150px]">{entry.composer}</span>
                        <span>•</span>
                        <span>{t("score.category_" + entry.category)}</span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-muted">
                      {Math.round(entry.duration / 60)}:{String(Math.round(entry.duration % 60)).padStart(2, "0")}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${diffBadgeClass(entry.difficulty)}`}>
                      {t("score.diff_" + entry.difficulty)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(entry.id);
                        }}
                        className="rounded p-1 text-muted hover:bg-amber-500/20 hover:text-amber-400 transition-colors"
                      >
                        <Star className={`h-3.5 w-3.5 ${isFav ? "fill-amber-400 text-amber-400" : ""}`} />
                      </button>
                      {custom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry);
                          }}
                          className="rounded p-1 text-muted hover:bg-red-500/20 hover:text-red-400 transition-colors"
                          title={t("score_delete.delete")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {filteredAndSorted.length === 0 && (
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

# Piano Practice - Project Memory

## Project Identity
- **Name**: Piano Practice (钢琴练习)
- **Type**: Desktop piano learning application
- **Location**: `C:\Users\Administrator\Documents\Piano\desktop`
- **Dev Server**: `http://127.0.0.1:7777/`
- **Product**: `piano-visualizer` v0.1.0

## Tech Stack
- **Framework**: Tauri 2.11 (Rust backend) + React 19 + TypeScript 6
- **Build**: Vite 8 + npm
- **Styling**: Tailwind CSS 3 + shadcn/ui (Radix primitives) + lucide-react icons
- **State**: Zustand 5 (with immer) + persist middleware (localStorage)
- **Rendering**: Native Canvas 2D (RAF loop in Stage.tsx) + **Verovio 6 (WASM) for MusicXML engraving**
- **Audio**: Additive synth + SplendidGrandPiano SoundFont via smplr
- **MIDI**: Web MIDI API + native MIDI via midir (Rust)
- **Score engraving**: Verovio (`verovio/esm` + `verovio/wasm`) — lazily loaded, ~7.9 MB WASM chunk
- **MIDI→MusicXML conversion**: webmscore (`webmscore` npm, MuseScore libmscore WASM) — ~23 MB, lazy Web Worker, fully offline
- **Testing**: Vitest + happy-dom (28 test files, 265 tests)
- **Packaging**: NSIS (~2 MB) + MSI (~3 MB) via cargo tauri build

## Architecture Overview

### App Modes (useAppModeStore)
```
home -> free                          (Free Play - full toolbar + waterfall)
home -> random-practice               (Random sight-reading + rhythm game + countdown)
home -> score-practice -> ScoreLibraryPage -> ScoreModeSelector -> Stage
```
All modes with a song loaded show the piano Stage (Canvas).

### Mode-Independent UI (per goal)
| Mode | Toolbar controls | HUD | Transport |
|------|-----------------|-----|-----------|
| free | Full Header (demo select, file picker, record, replay, save, sight-reading, practice toggle, settings) | StatsPanel | Full Transport (play/pause, scrub, tempo, loop, A-B) |
| random-practice | Eye icon (sight-reading params) + TempoControl + settings | RhythmGameHUD + ResultPanel | None |
| score-practice | Song list (SongSwitcher) + TempoControl (practice only) + mode switch + settings | RhythmGameHUD + ResultPanel (challenge only) | None |

### Key Components
| File | Role |
|------|------|
| App.tsx | Root router: HomePage / ScoreLibraryPage / Stage |
| Stage.tsx | Canvas RAF loop: grid, song notes, history, piano, VFX |
| Waterfall.tsx | drawSong() falling notes + drawHistory() upward trails |
| PianoKeyboard.tsx | drawPiano() canvas keyboard rendering |
| HomePage.tsx | Landing page with 3 mode cards + rank/points |
| ScoreLibraryPage.tsx | Song browser with filter/search/import |
| RhythmGameHUD.tsx | HP bar, combo, score, progress overlay |
| ResultPanel.tsx | Post-session stats: accuracy, rating, rank change |
| FreePlaySummary.tsx | Free play exit summary |
| SightReadingPanel.tsx | Sight-reading parameter config |
| SettingsPanel.tsx | Settings + MIDI device selection |
| Transport.tsx | Play/pause, tempo, loop, A-B loop controls |
| CountdownOverlay.tsx | 3-2-1 countdown before practice starts |
| TempoControl.tsx | Compact tempo slider (25%-200%) for practice modes |
| ScoreModeSelector.tsx | Practice vs Challenge mode picker before score practice |
| SongSwitcher.tsx | In-session song list switcher (score practice only) |

### Store Architecture (Zustand)
| Store | Purpose | Persisted? |
|-------|---------|-----------|
| useAppModeStore | Mode navigation (home/free/random/score) | No |
| useSettingsStore | Octave, labels, locale, color mode | Yes (localStorage) |
| useRhythmGameStore | HP, combo, score, rating, rank, totalPoints | Partial (rank+points) |
| usePracticeStore | Practice mode, hit/miss/wrong stats | No |
| useSongStore | Current loaded song | No |
| usePlaybackStore | Play state, tempo, loop, A-B loop | No |
| useInputStore | Active keys, history trails | No |
| useFreePlayStore | Free play session stats (duration, keys, range) | No |
| useSightReadingStore | Sight-reading generation params | Yes |
| useMidiDeviceStore | MIDI device selection | Yes (selectedId) |
| useRecordingStore | Recording state | No |
| useVFXStore | Hit particles, miss shake, combo milestones | No |
| useScoreLibraryStore | Custom imported scores | Yes |
| useScorePracticeStore | Score practice mode (practice/challenge) | Yes |

### Song System
- **Built-in songs** (12 total): TypeScript builders in src/lib/songs/
  - 4 demo: Twinkle, Ode to Joy, Fur Elise, Happy Birthday (names cleaned: no more mojibake)
  - 8 classical: Bach (Minuet G, Prelude C), Mozart (Twinkle Var), Beethoven (Sonatina G), Chopin (Prelude E minor), Schumann (Wild Horseman), Tchaikovsky (Old French Song), Burgmuller (Arabesque)

### Sight-Reading Generator (Enhanced)
- **Time signatures**: 2/4, 3/4, 4/4, 6/8 (difficulty-gated)
- **Interval control**: stepwise (beginner) -> small leaps (intermediate) -> large leaps/cross-octave (advanced)
- **Rhythm patterns**: quarter -> eighth -> dotted -> syncopated -> triplet (difficulty-gated)
- **Two-hand mode**: advanced difficulty introduces left-hand accompaniment (track 1, ~60% probability)
- **Key coverage**: beginner=C only, intermediate=C/G/F, advanced=all 8 keys (C,G,D,A,E,F,Bb,Eb)
- **Deterministic**: mulberry32 PRNG with seed, same seed = same exercise
- **Song catalog**: src/lib/songs/catalog.ts with CATEGORIES and DIFFICULTIES filters
- **Song builder**: src/lib/songs/builder.ts utility for constructing Song objects
- **Import**: Users can import **MIDI (.mid/.midi)** or **MusicXML (.musicxml/.xml)** files via the import dialog. MusicXML imports get a `sourceFormat: "musicxml"` marker in meta.json; on load they parse through Verovio (→ MIDI → `parseSmf`).

### Score View System (MusicXML + Verovio) — White Sheet Style
- **Purpose**: High-quality engraved sheet-music view for scores that have a MusicXML source, replacing the old PDF-sync view (removed) and the hand-rolled staff renderer (removed).
- **Entry**: `src/lib/verovio-engine.ts` (`loadScoreIntoVerovio`, `findActiveNoteIds`, `destroyVerovio`) + `src/components/ScoreView.tsx`.
- **Parse path**: `src/lib/musicxml-parser.ts` — MusicXML text → Verovio `loadData` → `renderToMIDI()` (returns a **base64** SMF string) → `atob` decode → existing `parseSmf`. Unified via `src/lib/score-parser.ts` (`parseScore(bytes, fmt)` + `inferFormatFromName`).
- **View modes** (`useScoreViewStore`, version 3): `"waterfall"` (default) | `"score"`. The score toggle is disabled unless the loaded song has `hasMusicXml` (custom imports only; built-in MIDI songs stay on waterfall).
- **Playback sync (CRITICAL)**: Verovio's `renderToTimemap()` times are in **ms at the score's default tempo**. `usePlaybackStore.currentSongTime()` already folds `tempoScale` into its elapsed, so the returned `songT` is already the un-scaled score seconds. The highlight formula is **`timemapMs = songT * 1000`** — do NOT divide by tempoScale (that double-applies it). Implemented in `ScoreView.tsx`'s RAF loop.
- **Visual style (white sheet)**: the score-view overlay host is **pure white** (`bg-white`), and Verovio's native **black** ink renders on it — like a real printed page. The engraved score sits in a centered **page card** (`max-w-3xl`, `rounded-lg`, `shadow-xl`, white bg) with the overlay filling the viewport around it. Loading/error overlays use `bg-white/85` + `text-zinc-700`.
- **Highlight color**: currently-sounding notes are forced **red `#e53935`** (Material Red 600) via `.vrv-playing`, applied to notehead + stem + path + use. The `!important` is mandatory — Verovio's `#id path { stroke: currentColor }` rule (specificity 1,0,1) beats a plain class rule (0,1,1) without it. The highlight CSS lives in `src/lib/verovio-score-theme.ts` as a TS constant (so the `!important` contract is unit-testable; Vitest stubs `.css?raw` imports).
- **Auto-scroll (system-based, NOT note-centered)**: the active note is found by id, then we walk up to its containing Verovio **system** (`<g class="system">` — one staff line, treble + bass for piano). The system is centered with `scrollIntoView({ block: "center", behavior: "smooth" })` **only when the system changes** (`lastSystemRef` sentinel). Notes moving within the same system produce **zero scroll** — this eliminates the per-note vertical jitter that the old note-centered scroll caused. Fallback chain: `.system` → `.measure` → skip the scroll.
- **Score-view behavior in Stage.tsx**: when `viewMode === "score"`, Stage keeps running `schedulePlayback` AND `practiceStore.tickMissed` (so challenge-mode HP/miss still work), then early-returns before canvas drawing. The on-screen piano + VFX are NOT rendered in score view (the ScoreView overlay covers the canvas).
- **Failure fallback**: if Verovio fails to load / MusicXML is malformed / song has no MusicXML, ScoreView shows `score_view.load_failed` + a "back to waterfall" button, and an effect in App.tsx resets `viewMode` to `waterfall`.
- **Not supported yet**: `.mxl` (zipped MusicXML) — would need `fflate` to unzip. Only raw `.musicxml`/`.xml`.

### MIDI → MusicXML Conversion (webmscore)
- **Purpose**: when a user imports a MIDI file (the typical path, since most downloads from MuseScore are MIDI), automatically convert it to MusicXML so the score (sheet-music) view is available. Lets every MIDI import gain a sheet-music view without the user needing a separate MusicXML file.
- **Engine**: `webmscore` npm package — MuseScore's `libmscore` C++ core compiled to **WebAssembly (~23 MB)**. Loaded fully offline; no CDN/network. The package's `browser` field points at `webmscore.cdn.mjs` (which hardcodes jsdelivr URLs) — **we override this in `vite.config.ts` via `resolve.alias` to use `webmscore.mjs` instead**, which uses Emscripten's `locateFile` with relative filenames.
- **WASM asset serving**: the four `webmscore.lib.*` files (`.wasm` 9.2MB + `.mem.wasm` 4.1MB + `.data` 4.1MB + `.symbols` 5.5MB) live in `node_modules/webmscore/`. A custom Vite plugin in `vite.config.ts` serves them at `/webmscore/*` in **dev** (middleware) and copies them into `dist/webmscore/` at **build** time (writeBundle hook).
- **CRITICAL — inner-worker asset URL injection (a hard-won fix)**: webmscore's `WebMscore` class spawns its OWN internal Web Worker (from a Blob URL) that runs the WASM, and bakes a global `MSCORE_SCRIPT_URL` into that worker via a string template: `var MSCORE_SCRIPT_URL = "${MSCORE_SCRIPT_URL$1}"`. The `${MSCORE_SCRIPT_URL$1}` is a free global reference that Vite's dep optimizer leaves UNRESOLVED — so at runtime the value is undefined → the inner worker's `locateFile` resolves asset paths against an invalid base → Vite serves `index.html` → the library tries to compile HTML as WASM ("expected magic word `00 61 73 6d`, found `3c 21 64 6f`" = `<!do` from `<!doctype html>`) and aborts. Symptom: the import dialog hangs on "Generating sheet music…" until the 120s safety timeout.
  - **Why setting `self.MSCORE_SCRIPT_URL` in OUR worker didn't work**: blob workers have an isolated global scope — our outer-worker global never reaches webmscore's inner worker.
  - **Why top-level Vite `define` didn't work**: Vite 8's Rolldown dep optimizer does NOT propagate app-level `define` into pre-bundled deps.
  - **Why a plugin `transform` hook didn't work**: Vite writes optimized dep cache files with its own pipeline; app-plugin transforms don't run during optimization (only at request-time for non-cached paths).
  - **The fix**: `vite.config.ts` patches `webmscore.mjs` at CONFIG-LOAD TIME (top-level code in the config file runs before Vite starts the optimizer) — it reads the source, replaces every `${MSCORE_SCRIPT_URL...}` template with `"+self.location.origin+"/webmscore/"+"`, and writes the result to `node_modules/webmscore/webmscore.patched.mjs`. The `resolve.alias` maps `webmscore` → the patched copy. The patched string flows through optimization into the inner blob worker. `self.location.origin` resolves to the app origin in EVERY context (the page, our outer worker, AND webmscore's inner blob worker — blob workers inherit the creator's origin), so it works in dev (`http://127.0.0.1:7777`) and Tauri prod (`<tauri-origin>`). The patched file is regenerated whenever its content changes (idempotent).
- **Entry**: `src/lib/midi-converter/index.ts` (`convertMidiToMusicXml(bytes, { onStage, timeoutMs })`, `destroyConverter`) + `src/lib/midi-converter/worker.ts`. The worker imports `webmscore`, calls `WebMscore.load('midi', bytes)` → `score.saveXml()` (uncompressed MusicXML text), then `score.destroy(true)`. The main-thread facade lazily spawns the worker on first use, reuses it across conversions, and has a 120s safety timeout that rejects so the UI never hangs forever on a stalled WASM init.
- **API**: `score.saveXml()` → `Promise<string>` (uncompressed MusicXML, what Verovio expects). `score.saveMxl()` → compressed bytes (unused). `WebMscore.load(format, data, fonts?, doLayout?)` — fonts default to none (the WASM bakes in MuseScore defaults; we never render webmscore's own SVG/PDF, only consume its MusicXML).
- **Trigger (UX)**: the ImportDialog has a **"Generate sheet music (MusicXML)" checkbox, default ON, shown only for MIDI imports**. MusicXML imports hide it (they already ARE the engraving source). The dialog is the progress surface — it does NOT close until the conversion (if requested) finishes.
- **Inline progress flow (BLOCKING)**: the dialog has three phases:
  - `"form"` — file/name/checkbox/Import buttons (default).
  - `"converting"` — spinner + stage label (`"Loading converter…"` on cold start, then `"Generating sheet music…"`). The form is hidden; Import/Cancel are disabled. Shown only when the user checked the box.
  - `"convert-error"` — inline error + a **"Continue without sheet music"** button. The MIDI score is already saved, so continuing finishes loading it as MIDI-only (score mode stays disabled). Graceful degradation — the original MIDI is never lost.
  - `onConfirm(result, { onStage }) => Promise<{ ok, error? }>` — the parent (`ScoreLibraryPage.handleImportConfirm`) does parse → save MIDI-only → (if checked) convert via `hooks.onStage` → `appendMusicXml` → rescan → load song. The song is loaded LAST, so the dialog stays on the progress surface the whole time, then closes into the mode-selection screen only after everything's ready. Returns `{ok:false, error}` on conversion failure so the dialog shows the error phase. "Continue without sheet music" re-invokes onConfirm with `generateMusicXml:false`; `lastImportedFolderRef` guards against double-saving.
- **Cold start**: the worker boots only on the first conversion call (pure lazy — no app-startup warmup, to avoid taxing users who never import MIDI). Subsequent conversions reuse the warm worker (~2-5s each).
- **Storage wiring**: `appendMusicXml(folder, bytes)` in `src/lib/score-storage/index.ts` writes `score.musicxml` to the existing score folder and patches the meta: `sourceFormat: "musicxml"`, `musicXmlFile: MUSICXML_FILENAME`. The Rust `list_score_folders` already accepts folders with either `song.mid` OR `score.musicxml`, so the rescan picks up the change with no Rust-side change.
- **Bundle impact**: webmscore worker is code-split into its own ~171 kB JS chunk (`dist/assets/worker-*.js`); the ~23 MB of `webmscore.lib.*` files are copied as static assets (not through the JS bundler). The worker JS is only fetched when a conversion starts. Net app-package size grows by ~23 MB (acceptable for a desktop app).
- **Known build warnings (benign)**: Vite reports `path`/`fs`/`crypto` "externalized for browser compatibility" — these are Node-only `require()` calls inside webmscore, all guarded by Emscripten's `ENVIRONMENT_IS_NODE` check, so they never execute in the worker.

### Rhythm Game System
- **HP**: 100 max, miss costs 8 HP, combo >= 5 recovers 2 HP per hit
- **Combo**: Multiplier tiers at 10/25/50/100 (1.5x/2x/3x/4x), milestone bonuses
- **Active in**: random-practice (always) + score-practice challenge mode (only)
- **NOT active in**: score-practice practice mode (practiceEnabled=false prevents hit detection)
- **Score**: base(100) * comboMultiplier * timingFactor (perfect<50ms=1.0, good<150ms=0.7, ok=0.4)
- **Rating**: S(>=95%), A(>=80%), B(>=65%), C(>=50%), D(<50%)
- **Rank tiers**: Beginner(0) -> Novice(500) -> Intermediate(2000) -> Advanced(5000) -> Expert(12000) -> Master(30000)
- **VFX**: Hit particles, miss screen shake, combo milestone flashes (10/25/50/100)

### i18n System
- **Implementation**: Custom lightweight (no i18next dependency)
- **Locales**: zh-CN, en, ja, es, fr, de (6 languages)
- **Files**: src/lib/i18n/{zh-CN,en,ja,es,fr,de}.ts + types.ts + index.ts
- **Usage**: useT() hook -> t("dotted.key.path", {param}) pattern
- **Important**: When adding UI text, add keys to ALL 6 locale files

### Rust Backend (src-tauri/)
- **Commands**: read_midi_bytes, save_midi_bytes (generic byte read/write, despite the name), get_scores_root, list_score_folders, delete_score_folder, midi::* (native MIDI)
- **list_score_folders**: lists a folder as valid if it has `meta.json` AND (`song.mid` OR `score.musicxml`) — supports both MIDI-only and MusicXML scores
- **Native MIDI**: midi.rs - list/start/stop MIDI via midir
- **Config**: Window 1280x800, min 960x600, centered, resizable
- **Constraint**: Do NOT modify src-tauri/ unless absolutely necessary (score-storage commands are the permitted exception)

## Development Commands
```powershell
npm run dev          # Vite dev server at http://127.0.0.1:7777
npm run build        # tsc + vite build (production)
npm test             # Vitest run (265 tests, 28 files)
npm run test:watch   # Vitest watch mode

cargo tauri dev      # Full Tauri window (needs Rust toolchain)
cargo tauri build    # Build NSIS + MSI installers

# Build script with all checks:
.\scripts\build.ps1                    # Default: test + build + NSIS + MSI
.\scripts\build.ps1 -SkipTests         # Skip test phase
.\scripts\build.ps1 -Bundles nsis      # NSIS only
.\scripts\build.ps1 -Clean             # Full Rust rebuild
```

## Known Gotchas
- **PowerShell**: No && support in older PS; use ; or separate commands
- **PowerShell quoting**: Inline -e scripts break; use @'...'@ | node - heredoc
- **cargo tauri build**: Often reports exit code 1 but succeeds; check for "Finished N bundles at:" in output
- **PATH**: cargo needs %USERPROFILE%\.cargo\bin in PATH each new shell session
- **Git**: No commits yet on master branch (repo initialized but no history)
- **README.md**: Has encoding corruption (Chinese characters garbled); this MEMORY.md is the accurate reference

## Constraints (from goal spec)
- Only modify src/ directory (frontend code)
- Do NOT modify src-tauri/, scripts/, node_modules/, dist/
- No accounts, paid services, or online features
- Maintain 6-language i18n for all new text
- Keep existing Zustand store architecture
- Public domain MIDI only (composers deceased 70+ years)
- Append-only i18n keys (don't change existing key semantics)

## File Map
```
desktop/
├── package.json              # npm project config
├── scripts/build.ps1         # Build script for NSIS + MSI
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Root router
│   ├── components/
│   │   ├── HomePage.tsx       # Landing: 3 mode cards + rank
│   │   ├── ScoreLibraryPage.tsx # Song browser
│   │   ├── Stage.tsx          # Canvas RAF loop
│   │   ├── RhythmGameHUD.tsx  # In-practice overlay
│   │   ├── ResultPanel.tsx    # Post-session results
│   │   ├── FreePlaySummary.tsx
│   │   ├── Header.tsx         # Top bar actions
│   │   ├── SettingsPanel.tsx  # Settings drawer
│   │   ├── SightReadingPanel.tsx
│   │   ├── SongStatusBar.tsx
│   │   ├── Transport.tsx      # Playback controls
│   │   ├── StatsPanel.tsx
│   │   ├── DropOverlay.tsx    # File drag-drop
│   │   ├── ErrorBoundary.tsx
│   │   ├── FilePickerButton.tsx
│   │   ├── Piano/
│   │   │   ├── PianoKeyboard.tsx  # drawPiano()
│   │   │   └── Waterfall.tsx      # drawSong() + drawHistory()
│   │   └── ui/button.tsx     # shadcn button
│   ├── lib/
│   │   ├── i18n/             # {index,types,zh-CN,en,ja,es,fr,de}.ts
│   │   ├── songs/            # 12 song builders + catalog + builder util
│   │   ├── sight-reading.ts  # Random exercise generator
│   │   ├── synth.ts          # Additive synth
│   │   ├── soundfont-engine.ts # SplendidGrandPiano
│   │   ├── smf-parser.ts     # MIDI file reader
│   │   ├── smf-writer.ts     # MIDI file writer
│   │   ├── audio-context.ts  # Singleton AudioContext
│   │   ├── midi-input.ts     # Web MIDI
│   │   ├── native-midi.ts    # Tauri native MIDI bridge
│   │   ├── playback-scheduler.ts
│   │   ├── practice.ts       # Practice mode logic
│   │   ├── keyboard-hotkeys.ts
│   │   ├── visual-effects.ts # Particles, shake, combo flash
│   │   ├── color.ts          # Note coloring
│   │   ├── piano-layout.ts   # Key position computation
│   │   └── note-utils.ts     # MIDI note helpers
│   ├── store/                # 13 Zustand stores
│   ├── test/                 # 28 test files (265 tests)
│   ├── types/                # midi.ts, webmidi.ts
│   └── styles/               # Global CSS
└── src-tauri/                # Rust backend (do NOT modify)
    ├── Cargo.toml            # tauri 2.11 + midir 0.11
    ├── src/{main,lib,midi}.rs
    ├── tauri.conf.json       # Window + build config
    └── capabilities/default.json
```

## Development Environment
- **OS**: Windows Server (Administrator)
- **Node**: v25.2.1
- **npm**: 11
- **Rust**: 1.96 (via rustup)
- **MSVC**: Build Tools 2022 installed
- **WebView2**: v148 (bundled with Windows 11)
- **VS Build**: 2022 available

## Recent History
- Project evolved from a simple web-based piano visualizer (single HTML file)
- Migrated to Tauri desktop app for native MIDI support
- Added i18n (6 languages), settings persistence, SoundFont audio
- Implemented learning-focused redesign with 3 modes + rhythm game system
- All 265 tests pass, build clean, dev server operational

### MusicXML + Verovio score view (2026-07-03 session)
1. **Removed the PDF score-view subsystem** entirely: PdfScoreView, AnchorEditorOverlay, pdf-viewer, anchor-scroll, the `pdfjs-dist` dependency, all `pdf_view.*`/`view_mode.pdf`/`import_dialog.pdf_*` i18n keys, and the `PdfAnchor`/`PdfScrollConfig`/`hasPdf`/`pdfFile`/`pdfScroll` fields from `ScoreMeta` and `ScoreEntry`. PDF sync via anchor interpolation was too fragile.
2. **Added MusicXML import**: ImportDialog now accepts `.mid`/`.midi`/`.musicxml`/`.xml`. `ScoreMeta` gained `sourceFormat` + `musicXmlFile` (schema v3). `score-storage` persists `score.musicxml` next to `song.mid`. Rust `list_score_folders` relaxed to accept either source file.
3. **Added the Verovio score view**: `verovio-engine.ts` (singleton toolkit) + `ScoreView.tsx` render engraved sheet music, highlight currently-sounding notes via `renderToTimemap()`, and auto-scroll. MusicXML→playable via Verovio `renderToMIDI()` (base64) → `parseSmf`.
4. **Removed the hand-written staff renderer** (`staff-renderer.ts`) — replaced by Verovio. Built-in MIDI-only songs now stay on the waterfall view.
5. **`useScoreViewStore`** narrowed to `"waterfall" | "score"` (v3) with a `migrate` that falls back stale `"staff"`/`"pdf"` values to `"waterfall"`.

### Bug Fixes (2026-06-13 session)
1. ResultPanel retry: now seeks to 0 + triggers countdown (was stuck at song end)
2. Score practice mode: practiceEnabled only for challenge mode (was running hit detection silently)
3. Song switcher: resets tempo to 1.0x for challenge mode on switch
4. Score practice toolbar: mode switch uses ArrowRightLeft icon + separate settings button
5. SightReadingPanel: removed redundant if/else branch
6. Demo song names: fixed mojibake ("F?r Elise" -> "Fur Elise", "Demo ? X" -> "X - Composer")

### New Components (2026-06-13)
- CountdownOverlay.tsx, ScoreModeSelector.tsx, SongSwitcher.tsx, TempoControl.tsx

### New Store (2026-06-13)
- useScorePracticeStore.ts (practice/challenge mode selection, persisted)

### New Tests (2026-06-13)
- score-practice.test.ts: store mode switching + rhythm game scoring (onHit/onMiss/combo/rating)
- sight-reading.test.ts: +10 tests for two-hand, difficulty tiers, time signatures, key coverage
- User is a programmer learning piano; app design draws from rhythm game concepts
- **Next features to consider**: more visual polish on countdown, song progress bar in practice modes, difficulty progression tracking

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
- **Rendering**: Native Canvas 2D (RAF loop in Stage.tsx)
- **Audio**: Additive synth + SplendidGrandPiano SoundFont via smplr
- **MIDI**: Web MIDI API + native MIDI via midir (Rust)
- **Testing**: Vitest + happy-dom (18 test files, 174 tests)
**Testing**: Vitest + happy-dom (19 test files, 189 tests)
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
- **Import**: Users can import .mid/.midi files via file picker

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
- **Commands**: read_midi_bytes, save_midi_bytes (file dialogs)
- **Native MIDI**: midi.rs - list/start/stop MIDI via midir
- **Config**: Window 1280x800, min 960x600, centered, resizable
- **Constraint**: Do NOT modify src-tauri/ unless absolutely necessary

## Development Commands
```powershell
npm run dev          # Vite dev server at http://127.0.0.1:7777
npm run build        # tsc + vite build (production)
npm test             # Vitest run (174 tests, 18 files)
-> now 189 tests, 19 files
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
│   ├── test/                 # 18 test files (174 tests)
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
- All 189 tests pass, build clean, dev server operational

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

# Piano Visualizer Desktop

Web 版 [`../index.html`](../index.html) 的桌面端重构。Tauri 2 + React 19 + TypeScript + Vite + Tailwind 3 + shadcn/ui + Zustand 5，画布用原生 Canvas 2D。

## 状态

**Phase 11 — 原生 MIDI + i18n 多语言已完成** ✓

| 模块 | 状态 |
|---|---|
| Tauri 2.11 外壳（Rust 1.96 + WebView2） | ✓ |
| NSIS / MSI 安装包 | ✓（1.95 MB / 2.98 MB） |
| React 19 + TypeScript 6 + Vite 8 | ✓ |
| Tailwind 3 + shadcn/ui | ✓ |
| Zustand 5 + immer | ✓ |
| 原生 Canvas 2D 画布（键盘 + 瀑布） | ✓ |
| 加法合成 + SoundFont（SplendidGrandPiano） | ✓ |
| Web MIDI + 原生 MIDI（midir） | ✓ |
| SMF 读写 / 多轨道 / 录音导出 | ✓ |
| 视奏训练 + 练习模式 + seed 持久化 | ✓ |
| 设置持久化（localStorage v2） | ✓ |
| Vitest + happy-dom（14 文件 130 用例） | ✓ |
| Phase 12 原生合成（cpal + rustysynth） | 可选，未实施 |

## 命令

```powershell
# 启动 dev server（浏览器 + Tauri 窗口同时可用）
npm run dev                # http://127.0.0.1:7777
cargo tauri dev            # 启 Tauri 窗口（需要 Rust 工具链在 PATH）

# 生产构建
npm run build              # 前端 dist/
cargo tauri build          # 产出 NSIS + MSI 安装包

# 测试
npm test                   # 一次性 130 用例
npm run test:watch         # watch 模式
```

> 提示：每个新 PowerShell 会话需要 `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"` 才能识别 `cargo`。

> 提示：PowerShell 的 `cargo tauri build` 经常返回 exit code 1，但其实是假警报。关键看输出里是否有 `Finished 2 bundles at:`。

## 语言支持

内置 6 种语言，在设置面板顶部下拉切换，选择立即生效并持久化到 localStorage：

- 简体中文 (zh-CN, 默认换浏览器语言自动识别)
- English (en)
- 日本語 (ja)
- Español (es)
- Français (fr)
- Deutsch (de)

实现：自建轻量 i18n（[《src/lib/i18n》](src/lib/i18n)），避免了 i18next 的 ~50 KB 依赖。全部语言文件合并后压缩仅 ~16 KB。

## 安装包

```
src-tauri/target/release/bundle/
├─ nsis/piano-visualizer_0.1.0_x64-setup.exe   # 1.95 MB
└─ msi/piano-visualizer_0.1.0_x64_en-US.msi   # 2.98 MB
```

NSIS 是推荐分发方式，体积小、卸载干牡；MSI 适合企业环境组策略部署。

## 目录

```
src/
├─ components/
│   ├─ Header.tsx              # Demo / 载入 .mid / 录音 / 回放 / 保存 / 练习 / 视奏 / 设置
│   ├─ Stage.tsx               # canvas 主人，RAF 循环
│   ├─ SettingsPanel.tsx       # 右侧抽屉（含 MIDI 设备列表）
│   ├─ SightReadingPanel.tsx   # 右侧抽屉（视奏参数）
│   ├─ Piano/{PianoKeyboard,Waterfall}.tsx
│   └─ ui/button.tsx           # shadcn
├─ lib/
│   ├─ audio-context.ts        # 单例 + unlock
│   ├─ synth.ts                # 后端分发（加法 vs Splendid）
│   ├─ soundfont-engine.ts     # smplr SplendidGrandPiano 封装
│   ├─ midi-input.ts           # Web MIDI
│   ├─ native-midi.ts          # Tauri 原生 MIDI（midir）封装
│   ├─ smf-parser.ts / smf-writer.ts
│   ├─ sight-reading.ts         # 生成器（mulberry32 + 阶调式）
│   ├─ playback-scheduler.ts / practice.ts / keyboard-hotkeys.ts
│   ├─ songs/{twinkle,ode,fur-elise,happy-birthday,builder,index}.ts
│   └─ color.ts / piano-layout.ts / note-utils.ts
├─ store/
│   ├─ useSettingsStore.ts     # 持久化 v2
│   ├─ useSightReadingStore.ts # 持久化（除陣 lastSeed）
│   ├─ useMidiDeviceStore.ts   # Web + 原生合并，持久化 selectedId
│   ├─ useInputStore.ts        # active / history / wrongFlash + 录音钩子
│   ├─ useRecordingStore.ts / usePlaybackStore.ts
│   └─ usePracticeStore.ts / useSongStore.ts
├─ test/  # 14 文件 130 用例
└─ types/{midi.ts, webmidi.ts}

src-tauri/
├─ Cargo.toml                # tauri 2.11 + dialog + log + midir 0.11
├─ src/
│   ├─ main.rs
│   ├─ lib.rs             # commands: read_midi_bytes, save_midi_bytes
│   └─ midi.rs            # list/start/stop/available 原生 MIDI
├─ icons/                      # 钢琴键盘主题（全平台）
└─ capabilities/default.json
```

## 路线图（v2 修订版）

- Phase 0  脚手架 ✓
- Phase 1  钢琴键盘 + 音频上下文 ✓
- Phase 2  Web MIDI + 文件对话框 + .mid 关联 ✓
- Phase 3  SMF 解析 + Demo ✓
- Phase 4  瀑布流 + Transport ✓
- Phase 5  多声道分色 ✓
- Phase 6  练习模式 ✓
- Phase 7  录制 + 导出 ✓
- Phase 8  视奏训练 + seed 持久化 ✓
- Phase 9  设置持久化 + 打磨 ✓
- Phase 10 SoundFont 真钢琴音色 ✓
- Phase 11 原生 MIDI（可选） ✓
- Phase 12 原生合成（可选） — 未实施

## 关于 Phase 12

当前加法合成 + SplendidGrandPiano SoundFont 已覆盖全部音色需求。P12（cpal + rustysynth）会提供亚 10 ms 延迟和离线渲染能力，但需要加入依赖库、增加包体积、且需要在前端同步维护两套合成路径。默认不实施，需要时再开启。

## 开发环境

- Node 25 / npm 11
- Rust 1.96（`%USERPROFILE%\.cargo\bin` 需加入 PATH）
- MSVC Build Tools 2022
- WebView2 Runtime v148（Windows 11 自带）
- NSIS + WiX（由 tauri 自动下载）

## 与 Web 版的关系

[`../index.html`](../index.html) 仍保留作为参照实现，功能 1:1 对应。桌面端是它的重构，不是替代。任何业务逻辑修改以桌面端为准，不再反向同步到单文件 HTML。

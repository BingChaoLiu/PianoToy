# 钢琴练习 · PianoToy

一个用 Tauri + React 19 构建的跨平台桌面钢琴练习应用：瀑布流可视化、MIDI/乐谱回放、错音检测练习、视奏训练、**基于 SM-2 间隔重复的识谱训练**，外加节奏游戏化的 HP / 连击 / 评级系统。内置 12 首公有领域 / 示范曲目，支持导入自己的 `.mid` / `.musicxml`。

> 旧版本是一个零依赖的单文件 HTML 应用；当前版本（v0.2.0）已重构为 Tauri 桌面应用，所有功能在原生窗口里运行。

## 功能总览

四种主模式，从首页（深色主题）选择进入：

| 模式 | 说明 |
| --- | --- |
| **自由弹奏** | 自由弹奏键盘，瀑布流 + 力度可视化 + 多声道分色，会话结束给出统计摘要。 |
| **随机练习** | 按调号 / 难度 / 小节数 / BPM 生成随机旋律，错音检测 + 节奏游戏 HUD（HP、连击、分数）。 |
| **乐谱练习** | 从乐谱库选曲或导入文件，Verovio 白底五线谱视图跟随播放高亮 + 自动滚动，练习 / 挑战两种子模式。 |
| **识谱** | SM-2 间隔重复引擎驱动的识谱训练：课程树（读谱 / 键位 / 音程 / 调号四大支）按掌握度逐级解锁，每日复习队列，字母音名答题面板 + 自适应软计时，练习 / 挑战双模式（挑战模式叠加 HP / 连击 / 评级游戏层）。 |

### 输入

- **原生 MIDI**（Tauri 桌面端，Rust `midir` 后端）：自动枚举输入设备，通过 `native-midi-message` 事件转发到前端，延迟比 Web MIDI 更低、设备识别更稳。
- **电脑键盘 fallback**：`A S D F G H J K L ;` 白键、`W E T Y U O P` 黑键，`Z / X` 切八度、`N` 切音名、`P` 切练习模式、空格播放/暂停。
- **力度可视化**：音符透明度随 MIDI velocity 变化。

### 音色

- **SoundFont 引擎**：基于 `smplr` 的 `SplendidGrandPiano`，首次使用时按需加载（约 6MB，HTTP 缓存）。
- **加法合成**：内置 Web Audio 加法合成（基波 + 二/三次谐波），ADSR 包络 + 低通滤波，作为不加载 SoundFont 时的回退。

### 可视化与回放

- **瀑布流**：白色亮音 = 正在响，淡蓝 = 预览音符。
- **白底五线谱视图**（v0.2.0 新）：Verovio 渲染 MusicXML 为内联 SVG，RAF 循环高亮当前发声音符，并按 **system**（谱表行）自动居中滚动，避免逐音抖动。
- **MIDI → MusicXML 转换**：导入 `.mid` 时可选通过 `webmscore`（WASM worker）生成乐谱视图，让纯 MIDI 文件也获得五线谱。
- **Transport**：播放 / 暂停、进度条、Tempo 25%–200%、AB 循环、卸载。

### 练习与游戏化

- **错音检测**：示范音符按状态变色 —— 🟢 命中（±300ms 容差）、⚪ 错过、⚪ 发光中、🔵 未来；错音红闪 0.6s。
- **时间偏差**：`+12ms` / `-45ms` 实时显示，告诉你弹早还是弹晚。
- **节奏游戏 HUD**：HP 条、连击倍率（10/25/50/100×）、分数、进度；连击里程碑奖励。
- **评级与段位**：单局 S/A/B/C/D 评级，累计积分 6 段位（Beginner → Master）。
- **统计面板**：命中 / 错过 / 错音 / 准确率 / 平均时间偏差。

### 识谱训练（SM-2 间隔重复）

识谱模式的核心是一套把「遗忘曲线」工程化的学习引擎，而不是无限随机的单音流：

- **SM-2 引擎**（`lib/sm2.ts`）：每张卡片 = `(音高, 谱号, 调号)`，维护 ease / interval / reps / due / 反应时间滚动均值（RMA）。答对推进间隔阶梯（1d → 6d → ×ease），答错重置阶梯、降低 ease（下限 1.3），「慢」只降 ease 不重置（流畅度训练，非记忆失败）。
- **课程树 + 解锁**（`lib/course.ts`）：四大技能支（读谱识别 / 键盘定位 / 音程识别 / 调号识别），目前读谱支开放 12 关（高音 1-6、低音 7-12，经典渐进）。解锁状态由卡片图**纯派生**——某关所有卡片越过掌握阈值即解锁下一关，无显式标志位需同步。
- **每日复习队列**（`lib/daily-queue.ts`）：每次进入按「到期卡片（最紧迫优先）+ 前沿关的新卡（封顶 N 张）」拼出今日清单，练习的是你**正在学**的内容。
- **三大有效性机制**：① 字母音名答题面板（C/D/E/F/G/A/B）——强制走「命名」这一步；② 答错立即判错并跳过（不提供免费重试，杜绝蒙猜）；③ 自适应软计时（RMA × 1.5），超时记为「慢」并让卡片重复，倒计时条临近归零时渐红。
- **练习 / 挑战双模式**：练习模式专注学习；挑战模式在同一批卡片上叠加游戏层（HP / 连击 / 分数 / S-A-D 评级 / 6 段位）。学习与游戏在引擎边界严格分离——SM-2 永远照常更新，游戏路由只在挑战模式生效。
- **持久化**：进度存为 `<app_local_data_dir>/progress.json`，防抖保存 + 退出即落盘；卡片损坏时优雅降级为空白起点。

### 多声道分色

设置面板切换 3 种模式：
- **C4 split**（默认）：以中央 C 为界，右手金色 / 左手青色。
- **by Track**：按 MIDI track 染色（6 色调色板：金/青/紫/玫瑰/天蓝/琥珀）。
- **single**：单色。

### 内置曲目（12 首）

示范曲（代码生成）：Twinkle Twinkle Little Star、Ode to Joy、Für Elise（开头）、Happy Birthday。
公有领域曲（代码生成，作曲家均逝世 70 年以上）：
J.S. Bach *Minuet in G Major* & *Prelude in C Major (WTC I)*、Mozart *Twinkle Variations (K.265)*、Beethoven *Sonatina in G (Anh.5)*、Chopin *Prelude in E minor (Op.28 No.4)*、Schumann *Wild Horseman*、Tchaikovsky *Old French Song*、Burgmüller *Arabesque (Op.100 No.2)*。

### 录制 + 导出

🔴 录制（红色脉冲指示）→ ▶ 回放（加载为示范）→ ↓ 导出为标准 `.mid`（SMF format 0，可在 DAW / Synthesia / Piano Marvel 打开）。

### 国际化

7 种语言：简体中文、English、日本語、Deutsch、Español、Français。

### 自动更新

v0.2.0 内置 Tauri updater，从 GitHub Releases 拉取 `latest.json` 并验签；启动时自动检查，带进度对话框和失败回退。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面框架 | **Tauri 2**（Rust 后端 + WebView 前端） |
| 前端 | **React 19** + TypeScript + Vite 8 |
| 状态管理 | Zustand（持久化到 localStorage / `app_local_data_dir`） |
| 样式 | Tailwind CSS + tailwindcss-animate + Radix UI primitives |
| 音频 | Web Audio API（加法合成）+ `smplr`（SoundFont）|
| 乐谱 | `verovio`（MusicXML → SVG 排版）+ `webmscore`（MIDI → MusicXML 转换，WASM worker）|
| MIDI | Rust `midir`（原生）+ Web MIDI API / 键盘 fallback |
| 测试 | Vitest + Testing Library + happy-dom |

### 项目结构

```
Piano/
├── desktop/                     # Tauri + React 应用
│   ├── src/
│   │   ├── App.tsx              # 根组件，路由四种模式
│   │   ├── components/          # UI 组件（Stage / HomePage / ScoreView / HUD ...）
│   │   │   └── Piano/           # PianoKeyboard + Waterfall
│   │   ├── lib/                 # 业务逻辑
│   │   │   ├── i18n/            # 7 语言翻译
│   │   │   ├── midi-converter/  # webmscore MIDI→MusicXML worker
│   │   │   ├── score-storage/   # FS / IndexedDB 存储 + 迁移
│   │   │   ├── progress-storage/ # 识谱 SM-2 进度持久化（progress.json）
│   │   │   ├── songs/           # 12 首内置曲目（代码生成）
│   │   │   ├── sm2.ts           # SM-2 间隔重复引擎 + 卡片模型
│   │   │   ├── course.ts        # 课程树 + 解锁状态机
│   │   │   ├── daily-queue.ts   # 每日复习队列构建器
│   │   │   ├── practice-controller.ts # 识谱练习会话控制器（纯函数）
│   │   │   ├── smf-parser.ts / smf-writer.ts
│   │   │   ├── soundfont-engine.ts / synth.ts
│   │   │   ├── verovio-engine.ts
│   │   │   └── ...
│   │   ├── store/               # Zustand stores（每模式一个 + 通用）
│   │   ├── test/                # 36 个测试文件，392 个用例
│   │   └── types/               # midi.ts / webmidi.ts
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── lib.rs           # 文件 IO + scores 目录管理 + progress.json 读写（路径校验 / 沙箱）
│   │   │   ├── midi.rs          # 原生 MIDI（midir）枚举 / 监听
│   │   │   └── main.rs
│   │   └── tauri.conf.json      # 窗口 / bundle / updater 配置
│   └── scripts/                 # build.ps1 / publish.ps1
├── AGENTS.md                    # Agent skills 配置入口
└── docs/agents/                 # issue tracker / triage labels / domain docs 配置
```

## 开发

### 前置依赖

- [Node.js](https://nodejs.org/)（含 npm）
- [Rust](https://www.rust-lang.org/) 工具链（`cargo`）
- [Tauri 2 前置依赖](https://v2.tauri.app/start/prerequisites/)（Windows 上需要 WebView2 + MSVC 构建工具）

### 安装与运行

```bash
cd desktop
npm install        # 安装前端依赖
npm run dev        # 仅前端开发服务器（http://127.0.0.1:7777）
# 或桌面应用开发模式（启动 Tauri 窗口 + 热重载）：
cargo tauri dev
```

### 测试

```bash
cd desktop
npm test           # 31 个文件 / 283 个用例（Vitest + happy-dom）
npm run lint       # ESLint
```

### 构建 & 发布

```powershell
# 构建 NSIS (.exe) + MSI 安装包（desktop/scripts/build.ps1）
.\desktop\scripts\build.ps1

# 构建并发布到 GitHub Releases，自动生成 latest.json 供应用内更新
# 需要 TAURI_SIGNING_PRIVATE_KEY 环境变量 + gh CLI 已登录
.\desktop\scripts\publish.ps1 -Version 0.2.0 -Notes "发布说明"
```

## 浏览器兼容

桌面应用在 Tauri WebView 中运行，原生 MIDI 在所有平台上可用。若仅用前端 `npm run dev`：

| 浏览器 | 原生 MIDI（Tauri） | Web MIDI 输入 | 文件回放 | 练习模式 | 录制导出 | 五线谱视图 |
|--------|--------------------|---------------|----------|----------|----------|------------|
| Tauri (WebView2/WKWebView) | ✅ | 取决于内核 | ✅ | ✅ | ✅ | ✅ |
| Chrome / Edge | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| Firefox | — | ❌ | ✅ | ✅ | ✅ | ✅ |
| Safari | — | ❌ | ✅ | ✅ | ✅ | ✅ |

## 已验证

端到端测试 392 项全部通过（Vitest，涵盖 SMF 解析 / 录制 / 练习判定 / 视奏生成质量 / 乐谱存储迁移 / MusicXML 转换 / 多声道分色 / 国际化 / 键盘热键，以及识谱引擎全套：SM-2 调度、课程树与解锁状态机、每日队列、进度持久化、练习会话控制器、挑战模式路由）。

## 后续可加

- 节奏训练（用麦克风检测节奏准确度）
- 录制多轨叠加（loop station 模式）
- 段落循环的自动速度阶梯（每个循环提速 5%）
- 指法提示

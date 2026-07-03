# 乐谱存储系统改造与 PDF 曲谱视图

- **状态**: 设计已确认,待评审
- **日期**: 2026-06-20
- **作者**: brainstorming 协作产出
- **范围**: `desktop/src/`(主体) + `desktop/src-tauri/`(必要例外)

## 1. 背景与目标

### 1.1 现状
- 导入的 MIDI 字节存于 **IndexedDB**(`src/lib/midi-storage.ts`,db=`piano-midi-store`),元数据通过 `useScoreLibraryStore` persist 到 localStorage,以 `id` 关联。
- 内置 12 首曲目是 TS 常量(`src/lib/songs/catalog.ts`),编译进 bundle。
- Tauri 后端只有 `read_midi_bytes(path)` / `save_midi_bytes(path, bytes)` 两个命令,无 `tauri-plugin-fs`,无列目录能力。
- 无 PDF 支持。

### 1.2 目标
1. **真实文件系统存储**:每首导入的曲目一个独立文件夹,内含 `song.mid`、`score.pdf`(可选)、`meta.json` 配置文件。
2. **导入弹窗**:两个拖拽区(MIDI 必填、PDF 可选),导入即建文件夹写文件。
3. **乐谱练习扫描**:启动时扫描根目录,加载所有曲目元数据。
4. **PDF 曲谱视图**:三选一视图(瀑布流 / 五线谱 / PDF 曲谱)。PDF 跟随 MIDI 播放进度滚动(锚点插值),用户可标注锚点精修对齐。
5. **配置文件**:存储曲目元信息 + PDF 滚动锚点,支持运行时读写。

### 1.3 非目标
- OCR / 自动精确对齐(锚点靠用户手动标注 + 自动粗锚点兜底)。
- 给内置 12 首曲目加 PDF。
- MIDI 小节号 ↔ PDF 页码的自动语义映射。
- PDF 视图下的命中检测 / 评分(PDF 视图为纯展示模式)。

## 2. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 存储介质 | 真实文件系统 | 满足"文件夹+配置文件+扫描目录"的核心诉求;IndexedDB 无法真实建文件夹 |
| 根目录 | `appLocalDataDir()/scores` | 避开 OneDrive/网盘同步风暴和文件锁;提供"打开曲库"按钮弥补可见性 |
| 配置格式 | JSON (`meta.json`) | 人类可读、可手编、通用 |
| PDF 渲染 | `pdfjs-dist`(懒加载) | 成熟、可控,支持 canvas 渲染和按需取页 |
| 旧数据迁移 | 自动迁移(IndexedDB → 文件系统) | 用户无感知、不丢数据 |
| PDF 滚动模型 | 锚点插值跟随 MIDI 进度 | 共享 MIDI 时钟→全局零漂移;空白/末页不满/局部疏密由锚点间距自然解决 |
| PDF 模式语义 | 纯展示,无命中检测 | 简化;音符不下落、无判定线、无评分;按键仍可发声,原声播放可联动 |
| 视图切换 | 三选一(waterfall/staff/pdf) | 复用现有切换组,无 PDF 的曲目灰掉 pdf 选项 |
| 导入必填项 | MIDI 必填,PDF 可选 | MIDI 是练习/播放核心 |

## 3. 存储架构

### 3.1 目录布局

```
<appLocalDataDir>/scores/
├── .migrated                     # 迁移完成标记(幂等开关)
├── 1718841600-mad-world/
│   ├── song.mid                  # MIDI(必填,固定文件名)
│   ├── score.pdf                 # PDF(可选,固定文件名)
│   └── meta.json                 # 配置
├── 1718900000-fur-elise/
│   ├── song.mid
│   └── meta.json                 # 无 PDF:不写 pdfFile/hasPdf=false
└── ...
```

`appLocalDataDir` 在 Windows 上解析为 `%LOCALAPPDATA%/<bundle identifier>`,即 `%LOCALAPPDATA%/com.piano.visualizer/scores`。

### 3.2 命名与 id

- **文件夹名 / id**: `<timestamp>-<slug>`。timestamp 取导入时刻 Unix 秒;slug 从用户输入曲名 sanitize。
- **slug 规则**: 小写化;过滤 `< > : " / \ | ? *`、首尾空格与点、Windows 保留名(`CON`/`PRN`/`AUX`/`NUL`/`COM1-9`/`LPT1-9`);空格转 `-`;连续 `-` 合并;Unicode(含中文)保留;结果为空时回退 `untitled`。
- **id 稳定性**: id 与文件夹名相同,不随后续改名变动(改名只改 `meta.name`)。
- **`meta.name`**: 存原始曲名,可含特殊字符。

### 3.3 路径安全

所有涉及磁盘路径的操作遵循:
1. **folder 白名单**: folder 参数必须匹配 `^[A-Za-z0-9_-]+$`,拒绝 `..`、绝对路径、分隔符。
2. **canonicalize 校验**: 拼接后 `canonicalize`,校验结果仍以根目录为前缀,防符号链接/`..` 逃逸。
3. **文件名固定**: `song.mid` / `score.pdf` / `meta.json` 由系统写死,不接受前端任意文件名(降低注入面)。

纵深防御:前端 `native.ts` 的路径拼接工具强制做 folder 白名单校验,Rust 端再做 canonicalize,双层校验。

## 4. Tauri 后端(必要例外)

> AGENTS.md 规定"不能改 src-tauri"。本功能需文件系统/目录能力,经用户确认作为**必要例外**放开。建议同步更新 AGENTS.md,新增"scores 子系统例外"条款。

新增 3 个 Rust 命令(`src-tauri/src/lib.rs`),复用现有 `save_midi_bytes` / `read_midi_bytes` 读写文件字节:

| 命令 | 签名 | 作用 | 安全 |
|------|------|------|------|
| `get_scores_root` | `() -> Result<String, String>` | 返回根目录绝对路径,不存在则递归创建 | 无入参 |
| `list_score_folders` | `() -> Result<Vec<MetaRaw>, String>` | 扫描根目录子文件夹,读 `meta.json`,返回有效曲目数组 | 只读根目录;损坏项跳过不崩溃 |
| `delete_score_folder` | `(folder: String) -> Result<(), String>` | 删除指定曲目文件夹(含内部所有文件) | canonicalize 校验 + folder 白名单 |

`list_score_folders` 返回的 `MetaRaw` 是 `meta.json` 原始解析结果 + 运行时补充字段(`hasPdf` 由 `score.pdf` 是否存在重算)。

3 个新命令需在 `tauri::generate_handler!` 中注册(与现有 `read_midi_bytes`/`save_midi_bytes` 并列)。它们是自定义命令,走 `core:default` 的 invoke 权限,**无需在 `capabilities/default.json` 新增 permission 条目**。

读写 MIDI/PDF 字节复用现有命令:前端拼完整路径调 `save_midi_bytes` / `read_midi_bytes`。

## 5. meta.json 结构

```json
{
  "schemaVersion": 1,
  "id": "1718841600-mad-world",
  "name": "Mad World",
  "composer": "Gary Jules",
  "difficulty": "hard",
  "category": "custom",
  "midiFile": "song.mid",
  "pdfFile": "score.pdf",
  "hasPdf": true,
  "duration": 198.4,
  "noteCount": 542,
  "tempo": 123,
  "timeSignature": "4/4",
  "addedAt": 1718841600,
  "pdfScroll": {
    "mode": "follow",
    "scrollableHeight": 8400,
    "anchors": [
      { "songTime": 0,    "pdfY": 0    },
      { "songTime": 45.2, "pdfY": 1100 },
      { "songTime": 98.7, "pdfY": 2200 }
    ]
  }
}
```

### 5.1 字段说明
- `schemaVersion`: 整数,从 1 起,用于未来字段迁移的版本分发。
- `id` / `name` / `composer` / `difficulty` / `category`: 元信息。`category` 取值 `"built-in"`(内置曲目,文件系统曲目恒为 `"custom"`)。UI 层合并展示内置曲目(`catalog.ts`,`category="built-in"`)与文件系统曲目(`category="custom"`),据此区分图标/来源标识。`composer`/`difficulty` 在导入时从 MIDI 推断或留空。
- `midiFile` / `pdfFile`: 固定文件名 `"song.mid"` / `"score.pdf"`。
- `hasPdf`: 是否有 PDF。**扫描时由 `score.pdf` 是否存在重算,不信任 meta 旧值**。
- `duration` / `noteCount` / `tempo` / `timeSignature`: 从 MIDI 解析得出。
- `addedAt`: 导入时刻 Unix 秒。
- `pdfScroll`: 仅 `hasPdf=true` 时存在。

### 5.2 pdfScroll
- `mode`: `"follow"`(跟随 MIDI,当前唯一模式,保留扩展位)。
- `scrollableHeight`: PDF 可滚动总高度(像素),首次打开 PDF 时由 pdf.js 测得并写入。
- `anchors`: `[{ songTime: number, pdfY: number }]`,按 `songTime` 升序。空数组表示尚未生成锚点(首次打开时自动生成粗锚点)。

### 5.3 健壮性(扫描时强制)
- 缺 `schemaVersion` / `midiFile` → 跳过该曲目,记日志,不崩溃。
- `meta.json` JSON 解析失败 → 跳过。
- `song.mid` 文件不存在 → 跳过。
- `hasPdf` 由运行时 `score.pdf` 存在性重算。
- `pdfScroll` 仅当 `hasPdf && score.pdf` 可读时保留,否则丢弃。
- 未来 schema 升级:`schemaVersion` 分发到迁移函数。

## 6. 前端模块划分

```
src/lib/score-storage/           # 新模块,替代 midi-storage.ts 的导入职责
├── index.ts                     # 门面:importScore / listScores / loadScoreMidi / loadScorePdf / deleteScore / rescan / initScoreStorage
├── types.ts                     # ScoreFolder / PdfScroll / Anchor / MetaRaw 类型
├── native.ts                    # Tauri 命令封装 + 路径拼接 + folder 白名单校验
├── web-fallback.ts              # 浏览器 dev fallback(IndexedDB)
└── migration.ts                 # 一次性 IndexedDB → 文件系统迁移(幂等)

src/lib/pdf/
├── pdf-viewer.ts                # pdf.js 封装:懒加载、按需渲染页、测 scrollableHeight
├── anchor-scroll.ts             # 锚点插值: songTime → pdfY(纯函数)
└── anchor-editor.ts             # 手动标注逻辑:增删拖拽锚点、取当前播放时间为锚点

src/components/
├── ImportDialog.tsx             # 导入弹窗(双拖拽区)
├── PdfScoreView.tsx             # PDF 展示视图(Stage 内三选一切换)
└── AnchorEditorOverlay.tsx      # 锚点标注覆盖层
```

### 6.1 store 改造
- **`useScoreLibraryStore`**: `customScores` **不再 persist** 到 localStorage。改为启动时 `rescan()` 填充的内存缓存。localStorage 只保留迁移标记字段。内置曲目(`catalog.ts`)与文件系统曲目在 UI 层合并展示。
- **`useSettingsStore`**: 新增 `scoreView: 'waterfall' | 'staff' | 'pdf'`(默认 `waterfall`),persist。

### 6.2 导入入口切换
- 现有导入走 `midi-storage.ts` 的 `saveMidi`。新方案的导入入口切到 `score-storage/index.ts` 的 `importScore`。
- `midi-storage.ts` **保留**:供迁移逻辑读取旧数据 + web fallback 使用。新代码不再向它写入。

## 7. 导入流程(ImportDialog)

1. 用户在曲库页点"导入" → 打开 `ImportDialog`。
2. 两个拖拽区:
   - **MIDI 区(必填)**:接受 `.mid`/`.midi`,拖拽或点击选择。校验扩展名与非空。
   - **PDF 区(可选)**:接受 `.pdf`,拖拽或点击选择。校验扩展名与大小(上限如 50MB)。
3. 两文件就绪后(MIDI 必填),前端解析 MIDI(复用 `parseSmf`)提取 `name`(默认填曲名,可编辑)/`composer`/`duration`/`noteCount`/`tempo`/`timeSignature`。
4. 用户确认 → 调 `importScore({ midiBytes, pdfBytes?, name })`:
   - 生成 id `<timestamp>-<slug(name)>`。
   - 建文件夹,写 `song.mid`、可选 `score.pdf`、`meta.json`(`pdfScroll.anchors=[]`,首次打开 PDF 时生成粗锚点)。
   - 写入策略:先写 `song.mid.tmp` → 成功后 rename;失败时清理已建文件夹,不残留半成品。
   - 触发 `rescan()` 刷新曲库,关闭弹窗。
5. 错误处理:磁盘满/权限不足 → 弹窗提示,回滚清理。

## 8. 迁移流程(幂等、不丢数据)

应用启动时 `initScoreStorage()`:
1. `get_scores_root()` 确保根目录存在。
2. 检查根目录下 `.migrated` 标记文件 → 存在则跳过迁移,直接 `rescan()`。
3. 不存在 → 扫描 IndexedDB(`midi-storage.ts` 的 `loadAllMidi`):
   - 对每条旧记录(id=`custom-<ts>`, bytes),解析提取元信息,生成新 id(沿用时间戳 + slugify 旧 name),建文件夹写 `song.mid` + `meta.json`。
   - 逐条写,失败记日志跳过该条,继续下一条。
4. 全部处理完 → 写 `.migrated` 标记 → **然后**清空 IndexedDB。
5. 任何步骤异常 → 不写标记、不清 IndexedDB,下次启动重试。已写文件夹按 id 去重,不重复迁移。

## 9. PDF 展示视图

### 9.1 模式语义
PDF 视图 = **纯展示模式**:
- 不渲染下落音符、不画判定线、不计算命中、不计分。
- MIDI 播放继续(`schedulePlayback` 照常),原声播放(listenOnly)可联动("看谱听曲")。
- 用户按键仍经 synth 发声(free play 语义),但不评判。
- Stage 的 RAF 循环在 PDF 视图下:渲染层切到 `PdfScoreView`,跳过 note-falling 渲染和 hit detection,继续推进 playback 进度和 PDF 滚动。

### 9.2 三选一视图切换
- 复用现有工具栏 waterfall/staff 切换组,新增 `pdf` 选项。
- 无 PDF 的曲目灰掉 pdf 选项(`hasPdf=false`)。
- 视图状态存 `useSettingsStore.scoreView`。

### 9.3 锚点插值滚动
- **时钟源**: `usePlaybackStore.currentSongTime`。与音符下落共享同一时钟 → **全局零漂移**。
- **插值算法**(`anchor-scroll.ts`,纯函数):
  1. `anchors` 按 `songTime` 升序。
  2. 二分查找当前 `songTime` 落在哪两个锚点之间。
  3. 线性插值: `pdfY = a.pdfY + (songTime - a.songTime) / (b.songTime - a.songTime) * (b.pdfY - a.pdfY)`。
  4. 边界: songTime ≤ 首锚点 → 钳制到首锚点 pdfY;songTime ≥ 末锚点 → 钳制到末锚点 pdfY。
  5. 空锚点数组 → 返回 0(等待首次生成)。
- **空白区自动加速**: 锚点间距 pdfY 大但 songTime 小 → 该段速度自动快(锚点方案的天然红利,无需单独逻辑)。
- **末页不满**: 末尾锚点设在末页最后一个音符处,之后钳制,不会匀速滚到底。

### 9.4 锚点生成
- **首次打开 PDF**(anchors 为空): 自动生成粗锚点 —— 按 PDF 总页数 `n` 把 `duration` 均分,每页顶部一个锚点 `(i/n × duration, i × pageHeight)`。立即写入 meta.json。
- **手动精修**(`AnchorEditorOverlay`):
  - 用户在 PDF 上点击/拖拽设定锚点位置,取对应 pdfY。
  - songTime 来源:优先"用当前播放时间"按钮(播放到某处暂停,点位置自动取当前 songTime);或手动输入。
  - 可增删锚点。保存即更新 meta.json。

### 9.5 pdf.js 集成要点
- `pdfjs-dist`,**动态 `import()` 懒加载**,不进主 bundle(避免主包 +~300KB)。
- Worker: `new Worker(new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url), { type: 'module' })`。
- 渲染: 按需渲染可视页 ± 1 页到 canvas(虚拟滚动),避免一次性渲染全 PDF 爆内存。
- PDF 字节通过 `loadScorePdf(id)` 从磁盘读 → Blob URL → `pdfjs.getDocument`。
- 解除资源:视图卸载时 revoke Blob URL + 销毁 pdf.js document。

## 10. 测试策略

现有 189 测试不变。新增:
- **`score-storage` 纯逻辑**: 路径拼接、folder 白名单校验、id 生成、slugify、meta 校验跳过逻辑。Tauri 调用 mock 掉。
- **`anchor-scroll` 插值算法**: 纯函数单测。覆盖:锚点前/后/中间/单锚点/空锚点/重复 songTime。
- **迁移幂等性**: mock IndexedDB + mock fs,测正常完成、中途失败重跑、二次启动跳过。
- **PDF 渲染层**: happy-dom 下 canvas 测不了。把"决定渲染哪页""songTime→pdfY""按需页范围"等抽成纯函数/接口 mock 测试,渲染本身不单测。

## 11. 改动范围与风险

| 类别 | 内容 |
|------|------|
| **改 src-tauri(必要例外)** | `src-tauri/src/lib.rs` 新增 3 个命令 + canonicalize 校验;`capabilities/default.json` 加 `dialog` 已有,无需新权限 |
| **新依赖** | `pdfjs-dist`(前端,懒加载);Rust 端无新 crate(复用 `std::fs`) |
| **破坏性变更** | `useScoreLibraryStore.customScores` 不再 persist(迁移兜底,不丢数据);导入入口从 midi-storage 切到 score-storage |
| **最大风险** | (1) pdf.js worker 在 Tauri WebView2 + Vite 的打包配置(已知深坑,需 worker URL + dynamic import);(2) 迁移逻辑原子性(.migrated 标记与清 IndexedDB 的时序) |
| **AGENTS.md 同步** | 更新规则,新增"scores 子系统例外:允许新增 scores 相关 Rust 命令"条款 |

## 12. 实施顺序(供 writing-plans 细化)

1. Rust: 3 个命令 + 路径校验 + 手动冒烟。
2. `score-storage` 模块(types / native / web-fallback / index)+ 路径与 slugify 工具 + 单测。
3. 迁移逻辑 + `.migrated` 标记 + 单测。
4. `ImportDialog` + 导入入口切换 + `rescan` 接入 `useScoreLibraryStore`。
5. `useSettingsStore.scoreView` + 三选一视图切换 UI。
6. `pdf-viewer`(pdf.js 懒加载 + 按需渲染)+ `PdfScoreView`。
7. `anchor-scroll` 插值 + 自动粗锚点 + 单测。
8. `AnchorEditorOverlay` 手动标注。
9. Stage RAF 循环接入 PDF 视图分支(跳过 note-falling/hit-detection,继续 playback + PDF 滚动)。
10. 全量 `npm test` + `npm run build` + 手动验收。

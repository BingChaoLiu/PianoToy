# 乐谱存储系统改造与 PDF 曲谱视图 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把导入的 MIDI 从 IndexedDB 迁移到真实文件系统(每曲一文件夹 + meta.json 配置),新增 PDF 曲谱导入,并实现跟随 MIDI 进度滚动的 PDF 展示视图。

**Architecture:** Tauri 后端新增 3 个 Rust 命令(根目录/列目录/删文件夹)处理文件系统;前端新增 `score-storage/` 模块作为门面,启动时从 IndexedDB 迁移到磁盘;`pdf/` 模块用 pdf.js(懒加载)渲染 PDF,锚点插值算法把 MIDI 播放时间映射到 PDF 像素 y 坐标;视图切换复用现有 `useScoreViewStore` 扩展 `"pdf"` 模式。

**Tech Stack:** Rust(std::fs)、TypeScript、Zustand、React、pdf.js (`pdfjs-dist`)、Vitest、Tauri 2。

**Spec:** `docs/superpowers/specs/2026-06-20-score-storage-and-pdf-view-design.md`

---

## 关键约束(每个 task 都要遵守)

1. **只改 `desktop/src/` 和 `desktop/src-tauri/`(本功能必要例外)**。Spec 已记录 AGENTS.md 的例外。
2. **所有命令在 `desktop/` 目录下运行**。PowerShell 用 `;` 分隔,不用 `&&`。
3. **每个 task 结束跑全量测试** `npm test`(必须 189+ 新增全过)和 `npm run build`(必须干净)。
4. **i18n 新增文案必须同时加 6 语言**(`zh-CN`/`en`/`ja`/`es`/`fr`/`de`)+ `types.ts`,append-only。
5. **类型一致性**:本计划定义的类型/函数签名,后续 task 不得改名。

## 文件结构总览

**新增 Rust:**
- `desktop/src-tauri/src/lib.rs` — 新增 3 个命令(修改)

**新增前端 lib:**
- `desktop/src/lib/score-storage/types.ts` — 类型定义
- `desktop/src/lib/score-storage/slug.ts` — slugify + folder 名校验(纯函数)
- `desktop/src/lib/score-storage/native.ts` — Tauri 命令封装
- `desktop/src/lib/score-storage/web-fallback.ts` — 浏览器 dev fallback
- `desktop/src/lib/score-storage/index.ts` — 门面 API
- `desktop/src/lib/score-storage/migration.ts` — IndexedDB → 文件系统迁移
- `desktop/src/lib/pdf/anchor-scroll.ts` — 锚点插值纯函数
- `desktop/src/lib/pdf/pdf-viewer.ts` — pdf.js 封装(懒加载)

**新增前端组件:**
- `desktop/src/components/ImportDialog.tsx` — 导入弹窗
- `desktop/src/components/PdfScoreView.tsx` — PDF 展示视图
- `desktop/src/components/AnchorEditorOverlay.tsx` — 锚点标注

**修改前端:**
- `desktop/src/store/useScoreViewStore.ts` — 加 `"pdf"` 模式
- `desktop/src/store/useScoreLibraryStore.ts` — customScores 内存化 + rescan + hasPdf
- `desktop/src/components/ScoreLibraryPage.tsx` — 接入新导入/删除/启动 rescan
- `desktop/src/components/Stage.tsx` — PDF 视图分支
- `desktop/src/App.tsx` — 三选一切换 UI
- 6 个 i18n 文件 + `types.ts`

**新增测试:**
- `desktop/src/test/slug.test.ts`
- `desktop/src/test/score-storage.test.ts`
- `desktop/src/test/migration.test.ts`
- `desktop/src/test/anchor-scroll.test.ts`

---

## Task 1: Rust 后端 — 3 个文件系统命令

**Files:**
- Modify: `desktop/src-tauri/src/lib.rs`

本 task 没有自动化测试(Rust 命令在 happy-dom 里测不了)。靠手动冒烟 + 后续 task 的前端集成验证。先写实现,确保 `cargo check` 通过。

- [ ] **Step 1: 阅读现有 lib.rs**

读 `desktop/src-tauri/src/lib.rs`,理解现有 `read_midi_bytes`/`save_midi_bytes` 模式和 `invoke_handler!` 注册方式。

- [ ] **Step 2: 新增 3 个命令**

在 `read_midi_bytes`/`save_midi_bytes` 之后、`run()` 之前,追加:

```rust
/// Absolute path to the scores root directory, created if missing.
/// Layout: <appLocalDataDir>/scores/
#[tauri::command]
fn get_scores_root(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir failed: {}", e))?;
    let root = base.join("scores");
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("create_dir_all {} failed: {}", root.display(), e))?;
    Ok(root.to_string_lossy().into_owned())
}

/// Validate that a folder name is a safe single path segment.
/// Rejects `..`, absolute paths, separators, and anything outside [A-Za-z0-9_-].
fn validate_folder_name(folder: &str) -> Result<(), String> {
    if folder.is_empty()
        || folder.starts_with('.')
        || folder.contains(std::path::MAIN_SEPARATOR)
        || !folder
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("invalid folder name: {}", folder));
    }
    Ok(())
}

/// Canonicalize `root/folder` and verify it stays inside `root` (no escape via `..`/symlinks).
fn safe_join(root: &std::path::Path, folder: &str) -> Result<std::path::PathBuf, String> {
    validate_folder_name(folder)?;
    let target = root.join(folder);
    let canon = target
        .canonicalize()
        .map_err(|e| format!("canonicalize {} failed: {}", target.display(), e))?;
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("canonicalize root {} failed: {}", root.display(), e))?;
    if !canon.starts_with(&root_canon) {
        return Err(format!("path escapes scores root: {}", canon.display()));
    }
    Ok(canon)
}

/// Scan the scores root, returning the raw meta.json contents of every valid folder.
/// Folders without a valid meta.json or missing song.mid are skipped (not fatal).
#[tauri::command]
fn list_score_folders(app: tauri::AppHandle) -> Result<Vec<std::string::String>, String> {
    use tauri::Manager;
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir failed: {}", e))?
        .join("scores");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = std::fs::read_dir(&root)
        .map_err(|e| format!("read_dir {} failed: {}", root.display(), e))?;
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let folder_name = match dir.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Skip the migration marker file (it's a file, but be defensive).
        if folder_name.starts_with('.') {
            continue;
        }
        let meta_path = dir.join("meta.json");
        let song_path = dir.join("song.mid");
        if !meta_path.exists() || !song_path.exists() {
            continue;
        }
        match std::fs::read_to_string(&meta_path) {
            Ok(content) => out.push(content),
            Err(_) => continue, // skip unreadable meta
        }
    }
    Ok(out)
}

/// Delete an entire score folder (song.mid, score.pdf, meta.json).
#[tauri::command]
fn delete_score_folder(app: tauri::AppHandle, folder: String) -> Result<(), String> {
    use tauri::Manager;
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir failed: {}", e))?
        .join("scores");
    if !root.exists() {
        return Ok(()); // nothing to delete
    }
    let target = safe_join(&root, &folder)?;
    std::fs::remove_dir_all(&target)
        .map_err(|e| format!("remove_dir_all {} failed: {}", target.display(), e))?;
    Ok(())
}
```

- [ ] **Step 3: 注册到 invoke_handler**

把新命令加进 `tauri::generate_handler![]` 数组(与现有命令并列):

```rust
    .invoke_handler(tauri::generate_handler![
      read_midi_bytes,
      save_midi_bytes,
      midi::list_native_midi_inputs,
      midi::start_native_midi_listen,
      midi::stop_native_midi_listen,
      midi::native_midi_available,
      get_scores_root,
      list_score_folders,
      delete_score_folder,
    ])
```

- [ ] **Step 4: 验证编译**

Run:
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cd src-tauri; cargo check; cd ..
```
Expected: `Finished` 无错误。修复任何编译错误。

- [ ] **Step 5: 确认前端测试仍全过**

Run: `npm test`
Expected: 189 passed。

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): add scores filesystem commands (root/list/delete)"
```

---

## Task 2: score-storage 类型与 slug 纯函数

**Files:**
- Create: `desktop/src/lib/score-storage/types.ts`
- Create: `desktop/src/lib/score-storage/slug.ts`
- Test: `desktop/src/test/slug.test.ts`

- [ ] **Step 1: 写 types.ts**

Create `desktop/src/lib/score-storage/types.ts`:

```typescript
// Types for the file-system-backed score storage.

export interface PdfAnchor {
  /** MIDI playback time in seconds. */
  songTime: number;
  /** PDF y coordinate in pixels (relative to the top of the rendered PDF). */
  pdfY: number;
}

export interface PdfScrollConfig {
  /** Currently always "follow" (synced to MIDI time). Reserved for future modes. */
  mode: "follow";
  /** Total scrollable PDF height in pixels, measured on first open. */
  scrollableHeight: number;
  /** Sorted anchors; empty array means "not yet generated". */
  anchors: PdfAnchor[];
}

/** Raw shape of meta.json on disk. */
export interface ScoreMeta {
  schemaVersion: number;
  id: string;
  name: string;
  composer: string;
  difficulty: string;
  category: "custom";
  midiFile: string;
  pdfFile?: string;
  hasPdf: boolean;
  duration: number;
  noteCount: number;
  tempo: number;
  timeSignature: string;
  addedAt: number;
  pdfScroll?: PdfScrollConfig;
}

export const META_SCHEMA_VERSION = 1;

export const MIDI_FILENAME = "song.mid";
export const PDF_FILENAME = "score.pdf";
export const META_FILENAME = "meta.json";
export const MIGRATED_MARKER = ".migrated";
```

- [ ] **Step 2: 写 slug.ts 的失败测试**

Create `desktop/src/test/slug.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { slugify, makeScoreId, isValidFolderName } from "@/lib/score-storage/slug";

describe("slugify", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugify("Mad World")).toBe("mad-world");
  });

  it("filters forbidden filename characters", () => {
    expect(slugify('a<b>:"c/d\\e|f?g*h')).toBe("a-b-c-d-e-f-g-h");
  });

  it("collapses consecutive dashes", () => {
    expect(slugify("Hello   --- World")).toBe("hello-world");
  });

  it("strips leading/trailing dashes and dots", () => {
    expect(slugify("...Trailing...")).toBe("trailing");
  });

  it("preserves unicode (chinese)", () => {
    expect(slugify("月光奏鸣曲")).toBe("月光奏鸣曲");
  });

  it("falls back to untitled when result is empty", () => {
    expect(slugify("???")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });

  it("rejects windows reserved names by suffixing", () => {
    expect(slugify("CON")).toBe("con-");
    expect(slugify("nul")).toBe("nul-");
  });
});

describe("makeScoreId", () => {
  it("combines timestamp and slug", () => {
    expect(makeScoreId(1718841600, "Mad World")).toBe("1718841600-mad-world");
  });

  it("uses untitled slug for empty name", () => {
    expect(makeScoreId(1718841600, "")).toBe("1718841600-untitled");
  });
});

describe("isValidFolderName", () => {
  it("accepts valid names", () => {
    expect(isValidFolderName("1718841600-mad-world")).toBe(true);
    expect(isValidFolderName("a_b-c123")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isValidFolderName("..")).toBe(false);
    expect(isValidFolderName("../etc")).toBe(false);
    expect(isValidFolderName(".")).toBe(false);
  });

  it("rejects separators and dots prefix", () => {
    expect(isValidFolderName("a/b")).toBe(false);
    expect(isValidFolderName(".hidden")).toBe(false);
  });

  it("rejects empty", () => {
    expect(isValidFolderName("")).toBe(false);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -- slug`
Expected: FAIL(`slug` 模块不存在)。

- [ ] **Step 4: 实现 slug.ts**

Create `desktop/src/lib/score-storage/slug.ts`:

```typescript
// Pure helpers for score folder naming and path-safety validation.

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Convert a human name into a safe single path segment (folder name fragment). */
export function slugify(name: string): string {
  let s = name.toLowerCase();
  // Replace forbidden filename chars (and spaces) with dashes.
  s = s.replace(/[<>:"/\\|?*\s]+/g, "-");
  // Keep alphanumerics, dashes, underscores, and any non-ASCII (unicode letters).
  s = s.replace(/[^a-z0-9_-]+/gi, (m) => {
    // Preserve runs of non-ASCII chars as-is; drop other symbols.
    return /[^\x00-\x7f]/.test(m) ? m : "-";
  });
  // Collapse consecutive dashes.
  s = s.replace(/-+/g, "-");
  // Strip leading/trailing dashes and dots.
  s = s.replace(/^[.\-]+|[.\-]+$/g, "");
  if (WINDOWS_RESERVED.test(s)) s += "-";
  return s.length > 0 ? s : "untitled";
}

/** Build a stable score id from import timestamp + name slug. */
export function makeScoreId(timestampSeconds: number, name: string): string {
  return `${timestampSeconds}-${slugify(name)}`;
}

/** Validate a folder name is a safe single segment (no traversal/separator). */
export function isValidFolderName(folder: string): boolean {
  if (!folder) return false;
  if (folder.startsWith(".")) return false;
  if (folder.includes("/") || folder.includes("\\")) return false;
  return /^[A-Za-z0-9_-]+$/.test(folder);
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- slug`
Expected: PASS (所有 slug 测试)。

- [ ] **Step 6: 跑全量测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/lib/score-storage/types.ts src/lib/score-storage/slug.ts src/test/slug.test.ts
git commit -m "feat(score-storage): add meta types and slug/id helpers"
```

---

## Task 3: score-storage native + web-fallback

**Files:**
- Create: `desktop/src/lib/score-storage/native.ts`
- Create: `desktop/src/lib/score-storage/web-fallback.ts`

这两个文件是 `invoke` 封装和 IndexedDB fallback,纯 I/O,不做单元测试(happy-dom 无 Tauri;靠 Task 4 门面 + Task 8 集成验证)。先写实现。

- [ ] **Step 1: 写 native.ts**

Create `desktop/src/lib/score-storage/native.ts`:

```typescript
// Tauri command wrappers for the scores filesystem.
// All path construction goes through here so folder-name validation is enforced
// as defense-in-depth (Rust also validates via safe_join).

import { invoke } from "@tauri-apps/api/core";
import { isValidFolderName } from "./slug";
import {
  MIDI_FILENAME,
  PDF_FILENAME,
  META_FILENAME,
  type ScoreMeta,
} from "./types";

export function isNative(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function assertFolder(folder: string): void {
  if (!isValidFolderName(folder)) {
    throw new Error(`invalid score folder name: ${folder}`);
  }
}

/** Return the scores root absolute path, creating it if missing. */
export async function getScoresRoot(): Promise<string> {
  return invoke<string>("get_scores_root");
}

/** Read the raw meta.json strings of every valid score folder. */
export async function listScoreFoldersRaw(): Promise<string[]> {
  return invoke<string[]>("list_score_folders");
}

/** Delete an entire score folder. */
export async function deleteScoreFolderNative(folder: string): Promise<void> {
  assertFolder(folder);
  await invoke<void>("delete_score_folder", { folder });
}

/** Write bytes to a file inside a score folder (song.mid / score.pdf). */
async function writeFile(folder: string, filename: string, bytes: Uint8Array): Promise<void> {
  assertFolder(folder);
  const root = await getScoresRoot();
  // Reuse the existing per-path save command.
  await invoke<void>("save_midi_bytes", {
    path: `${root}/${folder}/${filename}`,
    bytes: Array.from(bytes),
  });
}

/** Read bytes of a file inside a score folder. */
export async function readScoreFileBytes(folder: string, filename: string): Promise<Uint8Array> {
  assertFolder(folder);
  const root = await getScoresRoot();
  const arr = await invoke<number[]>(`read_midi_bytes`, {
    path: `${root}/${folder}/${filename}`,
  });
  return new Uint8Array(arr);
}

export async function writeMidi(folder: string, bytes: Uint8Array): Promise<void> {
  await writeFile(folder, MIDI_FILENAME, bytes);
}

export async function writePdf(folder: string, bytes: Uint8Array): Promise<void> {
  await writeFile(folder, PDF_FILENAME, bytes);
}

export async function writeMeta(folder: string, meta: ScoreMeta): Promise<void> {
  await writeFile(folder, META_FILENAME, new TextEncoder().encode(JSON.stringify(meta, null, 2)));
}

export async function readMeta(folder: string): Promise<ScoreMeta | null> {
  try {
    const bytes = await readScoreFileBytes(folder, META_FILENAME);
    return JSON.parse(new TextDecoder().decode(bytes)) as ScoreMeta;
  } catch {
    return null;
  }
}

export async function readMidi(folder: string): Promise<Uint8Array> {
  return readScoreFileBytes(folder, MIDI_FILENAME);
}

export async function readPdf(folder: string): Promise<Uint8Array | null> {
  try {
    return await readScoreFileBytes(folder, PDF_FILENAME);
  } catch {
    return null;
  }
}

/** Whether score.pdf exists in a folder (best-effort). */
export async function hasPdfNative(folder: string): Promise<boolean> {
  const b = await readPdf(folder);
  return b !== null;
}
```

- [ ] **Step 2: 写 web-fallback.ts**

Create `desktop/src/lib/score-storage/web-fallback.ts`:

```typescript
// Browser/dev fallback: keep the same shape as native but store bytes in IndexedDB.
// Only used when NOT running under Tauri (e.g. `npm run dev` in a plain browser).
// Production builds run under Tauri and use native.ts.

import {
  type ScoreMeta,
  MIDI_FILENAME,
  PDF_FILENAME,
  META_FILENAME,
} from "./types";

const DB_NAME = "piano-score-fallback";
const STORE = "scores";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function key(folder: string, filename: string): string {
  return `${folder}/${filename}`;
}

async function put(folder: string, filename: string, data: Uint8Array | string): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, key(folder, filename));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getRaw(folder: string, filename: string): Promise<Uint8Array | string | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key(folder, filename));
    req.onsuccess = () => resolve((req.result as Uint8Array | string) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function listFolders(): Promise<string[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => {
      const folders = new Set<string>();
      for (const k of req.result as string[]) {
        const i = k.indexOf("/");
        if (i > 0) folders.add(k.slice(0, i));
      }
      resolve([...folders]);
    };
    req.onerror = () => reject(req.error);
  });
}

async function delFolder(folder: string): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    (store.getAllKeys() as IDBRequest<string[]>).onsuccess = () => {
      for (const k of (store.getAllKeys() as IDBRequest<string[]>).result || []) {
        if (k.startsWith(folder + "/")) store.delete(k);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const webFallback = {
  async writeMidi(folder: string, bytes: Uint8Array): Promise<void> {
    await put(folder, MIDI_FILENAME, bytes);
  },
  async writePdf(folder: string, bytes: Uint8Array): Promise<void> {
    await put(folder, PDF_FILENAME, bytes);
  },
  async writeMeta(folder: string, meta: ScoreMeta): Promise<void> {
    await put(folder, META_FILENAME, JSON.stringify(meta));
  },
  async readMeta(folder: string): Promise<ScoreMeta | null> {
    const raw = await getRaw(folder, META_FILENAME);
    if (!raw) return null;
    try {
      return JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ScoreMeta;
    } catch {
      return null;
    }
  },
  async readMidi(folder: string): Promise<Uint8Array | null> {
    const raw = await getRaw(folder, MIDI_FILENAME);
    return raw instanceof Uint8Array ? raw : null;
  },
  async readPdf(folder: string): Promise<Uint8Array | null> {
    const raw = await getRaw(folder, PDF_FILENAME);
    return raw instanceof Uint8Array ? raw : null;
  },
  async listScoreFoldersRaw(): Promise<string[]> {
    return listFolders();
  },
  async deleteScoreFolder(folder: string): Promise<void> {
    return delFolder(folder);
  },
  async getScoresRoot(): Promise<string> {
    return "indexeddb://scores";
  },
};
```

- [ ] **Step 3: 跑全量测试确认无回归**

Run: `npm test`
Expected: 全部 PASS(无新测试,只确认未破坏)。

- [ ] **Step 4: build 确认类型正确**

Run: `npm run build`
Expected: 干净通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/score-storage/native.ts src/lib/score-storage/web-fallback.ts
git commit -m "feat(score-storage): add native (Tauri) and web-fallback backends"
```

---

## Task 4: score-storage 门面 index.ts

**Files:**
- Create: `desktop/src/lib/score-storage/index.ts`
- Test: `desktop/src/test/score-storage.test.ts`

门面把 native/web-fallback 统一,提供高层 API。测试用 mock 后端验证门面逻辑(去重、hasPdf 重算、meta 写入结构),不碰真实 I/O。

- [ ] **Step 1: 写门面的失败测试**

Create `desktop/src/test/score-storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the backend before importing the facade.
const mockBackend = {
  writeMidi: vi.fn(),
  writePdf: vi.fn(),
  writeMeta: vi.fn(),
  readMeta: vi.fn(),
  readMidi: vi.fn(),
  readPdf: vi.fn(),
  listScoreFoldersRaw: vi.fn(),
  deleteScoreFolder: vi.fn(),
  getScoresRoot: vi.fn(),
};

vi.mock("@/lib/score-storage/native", () => ({
  isNative: () => true,
  __mockBackend: mockBackend,
}));

import { buildMetaFromMidi, parseListedMetas, importScoreToFolder } from "@/lib/score-storage";
import { makeScoreId } from "@/lib/score-storage/slug";

describe("buildMetaFromMidi", () => {
  it("builds a valid meta with required fields", () => {
    const id = makeScoreId(1718841600, "Mad World");
    const meta = buildMetaFromMidi({
      id,
      name: "Mad World",
      composer: "Gary Jules",
      difficulty: "hard",
      duration: 198.4,
      noteCount: 542,
      tempo: 123,
      timeSignature: "4/4",
      hasPdf: false,
    });
    expect(meta.schemaVersion).toBe(1);
    expect(meta.id).toBe(id);
    expect(meta.midiFile).toBe("song.mid");
    expect(meta.hasPdf).toBe(false);
    expect(meta.category).toBe("custom");
    expect(meta.pdfScroll).toBeUndefined();
  });

  it("includes pdfScroll placeholder when hasPdf is true", () => {
    const meta = buildMetaFromMidi({
      id: "x", name: "X", composer: "", difficulty: "medium",
      duration: 10, noteCount: 5, tempo: 100, timeSignature: "4/4", hasPdf: true,
    });
    expect(meta.hasPdf).toBe(true);
    expect(meta.pdfFile).toBe("score.pdf");
    expect(meta.pdfScroll).toEqual({ mode: "follow", scrollableHeight: 0, anchors: [] });
  });
});

describe("parseListedMetas", () => {
  it("skips invalid json and missing fields", () => {
    const raws = [
      "not json",
      JSON.stringify({ id: "x" }), // missing schemaVersion/midiFile
      JSON.stringify({
        schemaVersion: 1, id: "ok", name: "Ok", composer: "", difficulty: "easy",
        category: "custom", midiFile: "song.mid", pdfFile: "score.pdf", hasPdf: true,
        duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
      }),
    ];
    const metas = parseListedMetas(raws, (id) => id === "ok"); // simulate pdf presence for "ok"
    expect(metas).toHaveLength(1);
    expect(metas[0].id).toBe("ok");
  });

  it("forces hasPdf false when pdf predicate returns false", () => {
    const raw = JSON.stringify({
      schemaVersion: 1, id: "nope", name: "N", composer: "", difficulty: "easy",
      category: "custom", midiFile: "song.mid", pdfFile: "score.pdf", hasPdf: true,
      duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
    });
    const metas = parseListedMetas([raw], () => false);
    expect(metas[0].hasPdf).toBe(false);
    expect(metas[0].pdfFile).toBeUndefined();
    expect(metas[0].pdfScroll).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- score-storage`
Expected: FAIL(门面模块不存在)。

- [ ] **Step 3: 写门面 index.ts**

Create `desktop/src/lib/score-storage/index.ts`:

```typescript
// Score storage facade. High-level API for importing, listing, loading and
// deleting scores. Routes to the Tauri native backend in production, or to the
// IndexedDB web-fallback in plain-browser dev.

import { isNative } from "./native";
import { webFallback } from "./web-fallback";
import {
  makeScoreId,
  isValidFolderName,
} from "./slug";
import {
  type ScoreMeta,
  type PdfAnchor,
  META_SCHEMA_VERSION,
} from "./types";

export interface ImportScoreInput {
  midiBytes: Uint8Array;
  pdfBytes?: Uint8Array | null;
  name: string;
  composer?: string;
  difficulty?: string;
  /** Pre-parsed MIDI metadata (duration etc.). If omitted the facade parses. */
  duration?: number;
  noteCount?: number;
  tempo?: number;
  timeSignature?: string;
}

export interface ScoreMetaInput {
  id: string;
  name: string;
  composer: string;
  difficulty: string;
  duration: number;
  noteCount: number;
  tempo: number;
  timeSignature: string;
  hasPdf: boolean;
}

/** Build a meta.json object from imported MIDI metadata. */
export function buildMetaFromMidi(input: ScoreMetaInput): ScoreMeta {
  const meta: ScoreMeta = {
    schemaVersion: META_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    composer: input.composer,
    difficulty: input.difficulty,
    category: "custom",
    midiFile: "song.mid",
    hasPdf: false,
    duration: input.duration,
    noteCount: input.noteCount,
    tempo: input.tempo,
    timeSignature: input.timeSignature,
    addedAt: Math.floor(Date.now() / 1000),
  };
  if (input.hasPdf) {
    meta.pdfFile = "score.pdf";
    meta.hasPdf = true;
    meta.pdfScroll = { mode: "follow", scrollableHeight: 0, anchors: [] };
  }
  return meta;
}

/**
 * Parse raw meta.json strings from listScoreFolders into valid ScoreMeta[],
 * skipping corrupt/incomplete entries. hasPdf is recomputed from the pdfPresent
 * predicate (which checks score.pdf existence) so it never trusts stale meta.
 */
export function parseListedMetas(
  raws: string[],
  pdfPresent: (folderId: string) => boolean,
): ScoreMeta[] {
  const out: ScoreMeta[] = [];
  for (const raw of raws) {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      continue;
    }
    if (
      !m ||
      typeof m.schemaVersion !== "number" ||
      typeof m.midiFile !== "string" ||
      typeof m.id !== "string" ||
      typeof m.name !== "string"
    ) {
      continue;
    }
    // Recompute hasPdf from actual file presence.
    const present = pdfPresent(m.id);
    if (present) {
      m.hasPdf = true;
      m.pdfFile = "score.pdf";
      if (!m.pdfScroll) m.pdfScroll = { mode: "follow", scrollableHeight: 0, anchors: [] };
    } else {
      m.hasPdf = false;
      delete m.pdfFile;
      delete m.pdfScroll;
    }
    // Ensure required fields have safe defaults.
    if (typeof m.composer !== "string") m.composer = "";
    if (typeof m.difficulty !== "string") m.difficulty = "medium";
    if (typeof m.duration !== "number") m.duration = 0;
    if (typeof m.noteCount !== "number") m.noteCount = 0;
    if (typeof m.tempo !== "number") m.tempo = 120;
    if (typeof m.timeSignature !== "string") m.timeSignature = "4/4";
    if (typeof m.addedAt !== "number") m.addedAt = 0;
    m.category = "custom";
    out.push(m as ScoreMeta);
  }
  return out;
}

// --- Backend routing -------------------------------------------------------

type Backend = {
  writeMidi(folder: string, bytes: Uint8Array): Promise<void>;
  writePdf(folder: string, bytes: Uint8Array): Promise<void>;
  writeMeta(folder: string, meta: ScoreMeta): Promise<void>;
  readMeta(folder: string): Promise<ScoreMeta | null>;
  readMidi(folder: string): Promise<Uint8Array | null>;
  readPdf(folder: string): Promise<Uint8Array | null>;
  listScoreFoldersRaw(): Promise<string[]>;
  deleteScoreFolder(folder: string): Promise<void>;
  getScoresRoot(): Promise<string>;
};

async function backend(): Promise<Backend> {
  if (isNative()) {
    const n = await import("./native");
    return {
      writeMidi: n.writeMidi,
      writePdf: n.writePdf,
      writeMeta: n.writeMeta,
      readMeta: n.readMeta,
      readMidi: n.readMidi,
      readPdf: n.readPdf,
      listScoreFoldersRaw: n.listScoreFoldersRaw,
      deleteScoreFolder: n.deleteScoreFolderNative,
      getScoresRoot: n.getScoresRoot,
    };
  }
  return webFallback as Backend;
}

/** Import a score: create folder, write files + meta. Returns the new meta. */
export async function importScoreToFolder(
  input: ImportScoreInput,
  folder: string,
): Promise<ScoreMeta> {
  if (!isValidFolderName(folder)) {
    throw new Error(`invalid folder name: ${folder}`);
  }
  const b = await backend();
  const hasPdf = !!input.pdfBytes && input.pdfBytes.length > 0;
  const meta = buildMetaFromMidi({
    id: folder,
    name: input.name,
    composer: input.composer ?? "",
    difficulty: input.difficulty ?? "medium",
    duration: input.duration ?? 0,
    noteCount: input.noteCount ?? 0,
    tempo: input.tempo ?? 120,
    timeSignature: input.timeSignature ?? "4/4",
    hasPdf,
  });
  // Write MIDI first; if it fails, nothing else is written (no half-state).
  await b.writeMidi(folder, input.midiBytes);
  if (hasPdf && input.pdfBytes) {
    await b.writePdf(folder, input.pdfBytes);
  }
  await b.writeMeta(folder, meta);
  return meta;
}

/** Convenience: generate id from name + current time, then import. */
export async function importScore(input: ImportScoreInput): Promise<ScoreMeta> {
  const folder = makeScoreId(Math.floor(Date.now() / 1000), input.name);
  return importScoreToFolder(input, folder);
}

/** List all valid score metas on disk. */
export async function listScores(): Promise<ScoreMeta[]> {
  const b = await backend();
  const raws = await b.listScoreFoldersRaw();
  // For hasPdf, check pdf presence per folder (best-effort, parallel).
  // In native, raws already only include folders with song.mid; we still
  // verify pdf via readPdf existence.
  const present = new Set<string>();
  await Promise.all(
    raws.map(async (raw) => {
      let id = "";
      try {
        id = (JSON.parse(raw) as ScoreMeta).id;
      } catch {
        return;
      }
      const pdf = await b.readPdf(id);
      if (pdf && pdf.length > 0) present.add(id);
    }),
  );
  return parseListedMetas(raws, (id) => present.has(id));
}

/** Load the parsed MIDI bytes for a score (caller runs parseSmf). */
export async function loadScoreMidi(folder: string): Promise<Uint8Array | null> {
  const b = await backend();
  return b.readMidi(folder);
}

/** Load the PDF bytes for a score. */
export async function loadScorePdf(folder: string): Promise<Uint8Array | null> {
  const b = await backend();
  return b.readPdf(folder);
}

/** Read+write back an updated meta (e.g. after editing pdfScroll anchors). */
export async function saveScoreMeta(folder: string, meta: ScoreMeta): Promise<void> {
  const b = await backend();
  await b.writeMeta(folder, meta);
}

export async function readScoreMeta(folder: string): Promise<ScoreMeta | null> {
  const b = await backend();
  return b.readMeta(folder);
}

/** Delete an entire score folder. */
export async function deleteScore(folder: string): Promise<void> {
  const b = await backend();
  await b.deleteScoreFolder(folder);
}

/** Scores root path (mainly for an "open folder" button). */
export async function getScoresRoot(): Promise<string> {
  const b = await backend();
  return b.getScoresRoot();
}

export type { ScoreMeta, PdfAnchor, PdfScrollConfig } from "./types";
export { makeScoreId, isValidFolderName, slugify } from "./slug";
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- score-storage`
Expected: PASS。

- [ ] **Step 5: 跑全量测试 + build**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 6: Commit**

```bash
git add src/lib/score-storage/index.ts src/test/score-storage.test.ts
git commit -m "feat(score-storage): add facade with import/list/load/delete APIs"
```

---

## Task 5: IndexedDB → 文件系统迁移

**Files:**
- Create: `desktop/src/lib/score-storage/migration.ts`
- Test: `desktop/src/test/migration.test.ts`

迁移读取旧 IndexedDB (`midi-storage.ts`) → 写文件系统 → 写 `.migrated` 标记 → 清旧库。幂等。

- [ ] **Step 1: 写迁移失败测试**

Create `desktop/src/test/migration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock storage backends.
const mockFs = {
  writeMidi: vi.fn().mockResolvedValue(undefined),
  writePdf: vi.fn(),
  writeMeta: vi.fn().mockResolvedValue(undefined),
  readMeta: vi.fn(),
  readMidi: vi.fn(),
  readPdf: vi.fn(),
  listScoreFoldersRaw: vi.fn().mockResolvedValue([]),
  deleteScoreFolder: vi.fn(),
  getScoresRoot: vi.fn().mockResolvedValue("/root/scores"),
  writeFileRaw: vi.fn().mockResolvedValue(undefined), // for .migrated marker
  hasMarker: vi.fn().mockResolvedValue(false),
  setMarker: vi.fn().mockResolvedValue(undefined),
};

const mockOldDb = {
  loadAll: vi.fn(),
  clear: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/score-storage", () => ({
  importScoreToFolder: vi.fn(async (input: any, folder: string) => {
    await mockFs.writeMidi(folder, input.midiBytes);
    await mockFs.writeMeta(folder, { id: folder } as any);
    return { id: folder } as any;
  }),
  listScores: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/midi-storage", () => ({
  loadAllMidi: () => mockOldDb.loadAll(),
  clearAllMidi: () => mockOldDb.clear(),
}));

import { migrateIndexedDbToFs } from "@/lib/score-storage/migration";

describe("migrateIndexedDbToFs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.hasMarker.mockResolvedValue(false);
    mockOldDb.loadAll.mockResolvedValue([
      { id: "custom-1718841600123", name: "Mad World", bytes: new Uint8Array([1, 2, 3]) },
      { id: "custom-1718900000000", name: "Für Elise", bytes: new Uint8Array([4]) },
    ]);
  });

  it("skips when marker already present", async () => {
    mockFs.hasMarker.mockResolvedValue(true);
    const result = await migrateIndexedDbToFs();
    expect(result.skipped).toBe(true);
    expect(mockOldDb.loadAll).not.toHaveBeenCalled();
    expect(mockFs.writeMidi).not.toHaveBeenCalled();
  });

  it("writes each old record to a folder then sets marker and clears old db", async () => {
    const result = await migrateIndexedDbToFs();
    expect(result.skipped).toBe(false);
    expect(result.migrated).toBe(2);
    expect(mockFs.writeMidi).toHaveBeenCalledTimes(2);
    expect(mockFs.setMarker).toHaveBeenCalledTimes(1);
    expect(mockOldDb.clear).toHaveBeenCalledTimes(1);
  });

  it("does not clear old db if marker write fails", async () => {
    mockFs.setMarker.mockRejectedValue(new Error("disk full"));
    const result = await migrateIndexedDbToFs();
    expect(result.migrated).toBe(2);
    expect(mockOldDb.clear).not.toHaveBeenCalled();
  });

  it("continues past a single failing record", async () => {
    mockOldDb.loadAll.mockResolvedValue([
      { id: "custom-1", name: "A", bytes: new Uint8Array([1]) },
      { id: "custom-2", name: "B", bytes: new Uint8Array([2]) },
    ]);
    const { importScoreToFolder } = await import("@/lib/score-storage");
    (importScoreToFolder as any)
      .mockResolvedValueOnce({ id: "x" })
      .mockRejectedValueOnce(new Error("write failed"));
    const result = await migrateIndexedDbToFs();
    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- migration`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 先给 midi-storage.ts 加 loadAllMidi / clearAllMidi**

Modify `desktop/src/lib/midi-storage.ts` — 在文件末尾追加:

```typescript
/** Return all stored (id, bytes) pairs — used by the one-time migration. */
export async function loadAllMidi(): Promise<{ id: string; bytes: Uint8Array }[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("midi", "readonly");
    const store = tx.objectStore("midi");
    const out: { id: string; bytes: Uint8Array }[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        out.push({ id: cur.key as string, bytes: cur.value as Uint8Array });
        cur.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** Remove all stored MIDI bytes — called after a successful migration. */
export async function clearAllMidi(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("midi", "readwrite");
    tx.objectStore("midi").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Fetch the stored name for an old custom-<ts> id (best-effort, from a side store). */
export async function loadOldName(_id: string): Promise<string | null> {
  return null; // legacy ids carried no name; migration derives a fallback name
}
```

- [ ] **Step 4: 写 migration.ts**

Create `desktop/src/lib/score-storage/migration.ts`:

```typescript
// One-time migration of legacy IndexedDB MIDI storage (midi-storage.ts) to the
// file-system scores layout. Idempotent via a `.migrated` marker file: if the
// marker exists, migration is skipped. The old DB is only cleared AFTER the
// marker is written, so a crash mid-migration leaves old data intact and the
// next launch retries (folders already written are deduped by id).

import { invoke } from "@tauri-apps/api/core";
import { isNative } from "./native";
import { webFallback } from "./web-fallback";
import { importScoreToFolder, listScores } from "./index";
import { slugify } from "./slug";
import { MIGRATED_MARKER } from "./types";
import { loadAllMidi, clearAllMidi } from "@/lib/midi-storage";
import { parseSmf } from "@/lib/smf-parser";

export interface MigrationResult {
  skipped: boolean;
  migrated: number;
  failed: number;
}

/** True if the .migrated marker exists in the scores root. */
async function hasMarker(): Promise<boolean> {
  if (isNative()) {
    const root = await invoke<string>("get_scores_root");
    try {
      const bytes = await invoke<number[]>("read_midi_bytes", {
        path: `${root}/${MIGRATED_MARKER}`,
      });
      return bytes.length >= 0;
    } catch {
      return false;
    }
  }
  // web-fallback: marker is a meta-style entry in the fallback store.
  try {
    const root = await webFallback.getScoresRoot();
    void root;
    return false; // fallback migration is a no-op; nothing to migrate from
  } catch {
    return false;
  }
}

/** Write the .migrated marker. */
async function setMarker(): Promise<void> {
  if (!isNative()) return;
  const root = await invoke<string>("get_scores_root");
  await invoke<void>("save_midi_bytes", {
    path: `${root}/${MIGRATED_MARKER}`,
    bytes: Array.from(new TextEncoder().encode("1")),
  });
}

/**
 * Derive a friendly name for a legacy `custom-<timestamp>` id.
 * We have no stored name, so reuse the id as the display name; the user can
 * rename later (future feature).
 */
function nameFromLegacyId(id: string): string {
  // custom-1718841600123 -> "1718841600123"
  const m = id.match(/^custom-(.+)$/);
  return m ? m[1] : id;
}

/**
 * Derive a new folder id from a legacy id, preserving the timestamp so the
 * ordering on disk matches import order.
 */
function folderFromLegacyId(id: string): string {
  const m = id.match(/^custom-(\d+)$/);
  const ts = m ? m[1] : String(Date.now());
  const slug = slugify(nameFromLegacyId(id));
  return `${ts}-${slug}`;
}

/** Run the migration. Safe to call on every app launch. */
export async function migrateIndexedDbToFs(): Promise<MigrationResult> {
  if (await hasMarker()) {
    return { skipped: true, migrated: 0, failed: 0 };
  }

  // Avoid migrating folders that already exist (from a partial previous run).
  const existing = new Set((await listScores()).map((m) => m.id));

  let oldEntries: { id: string; bytes: Uint8Array }[] = [];
  try {
    oldEntries = await loadAllMidi();
  } catch {
    oldEntries = []; // no legacy db — nothing to migrate
  }

  let migrated = 0;
  let failed = 0;
  for (const entry of oldEntries) {
    const folder = folderFromLegacyId(entry.id);
    if (existing.has(folder)) {
      migrated++; // already migrated in a prior partial run
      continue;
    }
    try {
      // Parse to extract metadata for meta.json.
      let duration = 0;
      let noteCount = 0;
      let tempo = 120;
      try {
        const song = parseSmf(entry.bytes);
        duration = song.duration;
        noteCount = song.notes.length;
      } catch {
        // keep defaults if parse fails
      }
      await importScoreToFolder(
        {
          midiBytes: entry.bytes,
          name: nameFromLegacyId(entry.id),
          duration,
          noteCount,
          tempo,
        },
        folder,
      );
      migrated++;
    } catch (err) {
      console.error(`[migration] failed for ${entry.id}:`, err);
      failed++;
    }
  }

  // Only stamp the marker and clear the old DB when all records were attempted.
  // If setMarker fails, do NOT clear the old DB so the next launch retries.
  try {
    await setMarker();
  } catch (err) {
    console.error("[migration] failed to write marker; old DB kept intact", err);
    return { skipped: false, migrated, failed };
  }

  try {
    await clearAllMidi();
  } catch (err) {
    console.error("[migration] failed to clear old DB (non-fatal)", err);
  }

  return { skipped: false, migrated, failed };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- migration`
Expected: PASS。

注意:测试里 `setMarker` 是 mock,但实现里它读 native。测试 mock 了 `@/lib/score-storage` 的 `importScoreToFolder`,但 `migration.ts` 内部调 `setMarker`/`hasMarker` 是直接 invoke。需确认 mock 生效。如果测试因 `isNative()` 在 happy-dom 返回 false(无 `__TAURI_INTERNALS__`)而走 web-fallback 分支导致 setMarker 是 no-op,测试会失败。

**修正**: 测试环境 happy-dom 下 `isNative()` 返回 false,`hasMarker`/`setMarker` 走 web-fallback 分支(hasMarker 恒返回 false,setMarker no-op)。这样 `mockOldDb.clear` 仍会被调(因为 setMarker 不抛),测试"writes each old record...sets marker and clears"里的 `setMarker` mock 不会被调到(因为走 web 分支)。

要让测试可控,mock `isNative` 为 true。在测试文件顶部加:

```typescript
vi.mock("@/lib/score-storage/native", () => ({
  isNative: () => true,
  __esModule: true,
}));
```

并把 `mockFs.setMarker`/`hasMarker` 通过 mock `@tauri-apps/api/core` 的 invoke 实现。简化:在测试里 mock invoke:

```typescript
const invokeMock = vi.fn(async (cmd: string, args?: any) => {
  if (cmd === "get_scores_root") return "/root/scores";
  if (cmd === "read_midi_bytes") {
    if (args?.path?.endsWith(".migrated")) return [49]; // pretend marker exists
    throw new Error("not found");
  }
  if (cmd === "save_midi_bytes") {
    if (args?.path?.endsWith(".migrated")) { mockFs.setMarker(); return; }
    return;
  }
  return null;
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: any[]) => invokeMock(...a) }));
```

并去掉前面的 `vi.mock("@/lib/score-storage/native", ...)` 那段(改用上面这段 invoke mock + `isNative` 默认走 native)。调整测试文件的 mock 段为:mock `@tauri-apps/api/core` 的 invoke(如上)+ mock `@/lib/score-storage` 的 importScoreToFolder/listScores + mock `@/lib/midi-storage`。hasMarker 的测试通过让 `read_midi_bytes` 对 `.migrated` 路径返回数组(存在)或抛错(不存在)来控制。

请实现者按上述调整测试 mock,确保 4 个用例都过。

- [ ] **Step 6: 跑全量测试 + build**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 7: Commit**

```bash
git add src/lib/score-storage/migration.ts src/lib/midi-storage.ts src/test/migration.test.ts
git commit -m "feat(score-storage): add idempotent IndexedDB→FS migration"
```

---

## Task 6: store 改造 — useScoreViewStore 加 pdf + useScoreLibraryStore 内存化

**Files:**
- Modify: `desktop/src/store/useScoreViewStore.ts`
- Modify: `desktop/src/store/useScoreLibraryStore.ts`
- Test: `desktop/src/test/score-library-store.test.ts` (create)

- [ ] **Step 1: useScoreViewStore 加 "pdf" 模式**

Modify `desktop/src/store/useScoreViewStore.ts`:

```typescript
// Score view mode: waterfall (falling notes) vs staff (sheet music scroll) vs pdf.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScoreViewMode = "waterfall" | "staff" | "pdf";

interface ScoreViewState {
  mode: ScoreViewMode;
  setMode: (m: ScoreViewMode) => void;
}

export const useScoreViewStore = create<ScoreViewState>()(
  persist(
    (set) => ({
      mode: "waterfall" as ScoreViewMode,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "piano.score-view",
      version: 1,
    },
  ),
);
```

- [ ] **Step 2: 写 useScoreLibraryStore 改造的失败测试**

Create `desktop/src/test/score-library-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/score-storage", () => ({
  listScores: vi.fn().mockResolvedValue([
    {
      schemaVersion: 1, id: "1-a", name: "A", composer: "", difficulty: "easy",
      category: "custom", midiFile: "song.mid", hasPdf: false,
      duration: 10, noteCount: 1, tempo: 100, timeSignature: "4/4", addedAt: 1,
    },
    {
      schemaVersion: 1, id: "2-b", name: "B", composer: "", difficulty: "hard",
      category: "custom", midiFile: "song.mid", hasPdf: true, pdfFile: "score.pdf",
      duration: 20, noteCount: 2, tempo: 100, timeSignature: "4/4", addedAt: 2,
      pdfScroll: { mode: "follow", scrollableHeight: 0, anchors: [] },
    },
  ]),
}));

import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";

describe("useScoreLibraryStore", () => {
  beforeEach(() => {
    useScoreLibraryStore.setState({ customScores: [], loaded: false });
    localStorage.clear();
  });

  it("rescan loads scores from score-storage and maps to entries", async () => {
    await useScoreLibraryStore.getState().rescan();
    const { customScores } = useScoreLibraryStore.getState();
    expect(customScores).toHaveLength(2);
    expect(customScores[0]).toMatchObject({
      id: "1-a", name: "A", category: "custom", build: null, filePath: null,
    });
    expect(customScores[1].hasPdf).toBe(true);
    expect(useScoreLibraryStore.getState().loaded).toBe(true);
  });

  it("customScores is NOT persisted to localStorage", async () => {
    await useScoreLibraryStore.getState().rescan();
    const raw = localStorage.getItem("piano.score-library");
    // persisted payload should not contain the loaded customScores
    expect(raw).toBeNull();
  });

  it("removeCustomScore updates in-memory list only", async () => {
    await useScoreLibraryStore.getState().rescan();
    useScoreLibraryStore.getState().removeCustomScore("1-a");
    expect(useScoreLibraryStore.getState().customScores).toHaveLength(1);
    expect(useScoreLibraryStore.getState().customScores[0].id).toBe("2-b");
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -- score-library-store`
Expected: FAIL(`loaded`/`rescan` 不存在)。

- [ ] **Step 4: 改造 useScoreLibraryStore**

Replace `desktop/src/store/useScoreLibraryStore.ts` 内容为:

```typescript
// Score library store. Built-in catalog (code) + custom scores (file system).
// customScores is an in-memory cache filled by rescan() at startup — it is NOT
// persisted to localStorage (the file system is the source of truth).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Song } from "@/types/midi";
import { listScores } from "@/lib/score-storage";

export type ScoreDifficulty = "easy" | "medium" | "hard";

export interface ScoreEntry {
  id: string;
  name: string;
  composer: string;
  difficulty: ScoreDifficulty;
  /** Duration in seconds, approximate */
  duration: number;
  /** Category for filtering */
  category: string;
  /** Build function for built-in songs, or null for file-based */
  build: (() => Song) | null;
  /** MIDI file path relative to public/ (for public domain pieces) */
  filePath: string | null;
  /** True if the score has an accompanying PDF (file-system scores only). */
  hasPdf?: boolean;
}

interface ScoreLibraryState {
  /** Custom imported scores (in-memory cache from file system). */
  customScores: ScoreEntry[];
  /** Whether the initial rescan has completed. */
  loaded: boolean;
  /** Rescan the file system and refresh customScores. */
  rescan: () => Promise<void>;
  addCustomScore: (entry: ScoreEntry) => void;
  removeCustomScore: (id: string) => void;
  setCustomScores: (scores: ScoreEntry[]) => void;
}

export const useScoreLibraryStore = create<ScoreLibraryState>()(
  persist(
    (set, get) => ({
      customScores: [],
      loaded: false,
      rescan: async () => {
        try {
          const metas = await listScores();
          const entries: ScoreEntry[] = metas.map((m) => ({
            id: m.id,
            name: m.name,
            composer: m.composer,
            difficulty: (m.difficulty as ScoreDifficulty) ?? "medium",
            duration: m.duration,
            category: "custom",
            build: null,
            filePath: null,
            hasPdf: !!m.hasPdf,
          }));
          set({ customScores: entries, loaded: true });
        } catch (err) {
          console.error("[score-library] rescan failed", err);
          set({ loaded: true }); // don't block the UI on scan failure
        }
      },
      addCustomScore: (entry) =>
        set((s) => ({ customScores: [...s.customScores, entry] })),
      removeCustomScore: (id) =>
        set((s) => ({ customScores: s.customScores.filter((e) => e.id !== id) })),
      setCustomScores: (customScores) => set({ customScores }),
    }),
    {
      name: "piano.score-library",
      version: 2,
      // Persist nothing — the file system is the source of truth. We keep the
      // persist wrapper only so the storage key/version exists for any legacy
      // data to be silently replaced on rehydrate.
      partialize: () => ({}),
    },
  ),
);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- score-library-store`
Expected: PASS。

- [ ] **Step 6: 跑全量测试 + build**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 7: Commit**

```bash
git add src/store/useScoreViewStore.ts src/store/useScoreLibraryStore.ts src/test/score-library-store.test.ts
git commit -m "feat(store): add pdf view mode and file-system-backed score library"
```

---

## Task 7: ImportDialog 组件(双拖拽区)

**Files:**
- Create: `desktop/src/components/ImportDialog.tsx`
- Modify: 6 个 i18n 文件 + `types.ts`(新增 import 对话框文案)

弹窗 UI 组件,纯展示+回调,不做 I/O(由 ScoreLibraryPage 接入时调 importScore)。先加 i18n 文案。

- [ ] **Step 1: 新增 i18n 文案(6 语言 + types)**

在 `types.ts` 的 `interface` 里,`score` 块之后追加一个 `import_dialog` 块(找到现有结构定位)。先确认 `types.ts` 有 `score` 块:

Read `desktop/src/lib/i18n/types.ts`,找到 `score:` 块的结束位置,在其后加:

```typescript
  import_dialog: {
    title: string;
    midi_zone: string;
    midi_zone_hint: string;
    pdf_zone: string;
    pdf_zone_hint: string;
    pdf_optional: string;
    name_label: string;
    cancel: string;
    confirm: string;
    drop_here: string;
    release_to_drop: string;
    file_too_large: string;
  };
```

在 `zh-CN.ts` 的 `score` 块之后追加:

```typescript
  import_dialog: {
    title: "导入乐谱",
    midi_zone: "MIDI 文件",
    midi_zone_hint: "拖入或点击选择 .mid / .midi（必填）",
    pdf_zone: "PDF 曲谱（可选）",
    pdf_zone_hint: "拖入或点击选择 .pdf",
    pdf_optional: "可选",
    name_label: "曲名",
    cancel: "取消",
    confirm: "导入",
    drop_here: "松开以导入",
    release_to_drop: "松开导入",
    file_too_large: "文件过大",
  },
```

`en.ts`:
```typescript
  import_dialog: {
    title: "Import Score",
    midi_zone: "MIDI File",
    midi_zone_hint: "Drop or click to select .mid / .midi (required)",
    pdf_zone: "PDF Score (optional)",
    pdf_zone_hint: "Drop or click to select .pdf",
    pdf_optional: "optional",
    name_label: "Name",
    cancel: "Cancel",
    confirm: "Import",
    drop_here: "Drop to import",
    release_to_drop: "Release to import",
    file_too_large: "File too large",
  },
```

`ja.ts`:
```typescript
  import_dialog: {
    title: "楽譜をインポート",
    midi_zone: "MIDI ファイル",
    midi_zone_hint: "ドラッグまたはクリックして .mid / .midi を選択（必須）",
    pdf_zone: "PDF 楽譜（任意）",
    pdf_zone_hint: "ドラッグまたはクリックして .pdf を選択",
    pdf_optional: "任意",
    name_label: "曲名",
    cancel: "キャンセル",
    confirm: "インポート",
    drop_here: "ドロップしてインポート",
    release_to_drop: "ドロップでインポート",
    file_too_large: "ファイルが大きすぎます",
  },
```

`es.ts`:
```typescript
  import_dialog: {
    title: "Importar Partitura",
    midi_zone: "Archivo MIDI",
    midi_zone_hint: "Arrastra o haz clic para elegir .mid / .midi (obligatorio)",
    pdf_zone: "Partitura PDF (opcional)",
    pdf_zone_hint: "Arrastra o haz clic para elegir .pdf",
    pdf_optional: "opcional",
    name_label: "Nombre",
    cancel: "Cancelar",
    confirm: "Importar",
    drop_here: "Suelta para importar",
    release_to_drop: "Suelta para importar",
    file_too_large: "Archivo demasiado grande",
  },
```

`fr.ts`:
```typescript
  import_dialog: {
    title: "Importer une Partition",
    midi_zone: "Fichier MIDI",
    midi_zone_hint: "Glissez ou cliquez pour choisir .mid / .midi (requis)",
    pdf_zone: "Partition PDF (optionnel)",
    pdf_zone_hint: "Glissez ou cliquez pour choisir .pdf",
    pdf_optional: "optionnel",
    name_label: "Nom",
    cancel: "Annuler",
    confirm: "Importer",
    drop_here: "Déposez pour importer",
    release_to_drop: "Déposez pour importer",
    file_too_large: "Fichier trop volumineux",
  },
```

`de.ts`:
```typescript
  import_dialog: {
    title: "Noten importieren",
    midi_zone: "MIDI-Datei",
    midi_zone_hint: ".mid / .midi per Drag oder Klick wählen (erforderlich)",
    pdf_zone: "PDF-Noten (optional)",
    pdf_zone_hint: ".pdf per Drag oder Klick wählen",
    pdf_optional: "optional",
    name_label: "Name",
    cancel: "Abbrechen",
    confirm: "Importieren",
    drop_here: "Zum Importieren loslassen",
    release_to_drop: "Zum Importieren loslassen",
    file_too_large: "Datei zu groß",
  },
```

- [ ] **Step 2: 写 ImportDialog.tsx**

Create `desktop/src/components/ImportDialog.tsx`:

```typescript
// Import dialog with two drop zones (MIDI required, PDF optional) and an
// editable name field. Pure presentational + callbacks; the parent performs
// the actual import via importScore().

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const pickMidi = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!/\.mid[ia]?$/i.test(file.name)) {
      setError("MIDI required");
      return;
    }
    const bytes = await readFile(file);
    setMidi({ bytes, name: file.name });
    if (!name) setName(file.name.replace(/\.(mid|midi)$/i, ""));
    setError(null);
  }, [name]);

  const pickPdf = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) {
      setError("PDF required");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(t("import_dialog.file_too_large"));
      return;
    }
    const bytes = await readFile(file);
    setPdf({ bytes, name: file.name });
    setError(null);
  }, [t]);

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

  const onDragOver = useCallback(
    (zone: "midi" | "pdf") => (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(zone);
    },
    [],
  );

  const onConfirm = useCallback(async () => {
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

  const zoneClass = (zone: "midi" | "pdf", filled: boolean, active: boolean) =>
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
            className={zoneClass("midi", !!midi, dragOver === "midi")}
            onClick={() => midiInputRef.current?.click()}
            onDrop={onDrop("midi")}
            onDragOver={onDragOver("midi")}
            onDragLeave={() => setDragOver(null)}
          >
            <div className="text-sm font-medium">{t("import_dialog.midi_zone")}</div>
            <div className="mt-1 text-xs text-muted">{t("import_dialog.midi_zone_hint")}</div>
            <div className="mt-2 text-xs text-green-400">
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
            className={zoneClass("pdf", !!pdf, dragOver === "pdf")}
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
            <div className="mt-2 text-xs text-green-400">
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
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        </div>

        {error && <div className="mt-3 text-sm text-red-400">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={busy}>
            {t("import_dialog.cancel")}
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={!midi || busy}>
            {t("import_dialog.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 确认 Input 组件存在**

Run(检查):
```
dir src\components\ui\input.tsx
```
若不存在,用现有 input 风格。若存在则跳过。若不存在则把 `<Input>` 替换为 `<input className="h-8 w-full rounded border border-bg-3 bg-bg-2 px-2" ... />`。

- [ ] **Step 4: 跑全量测试 + build**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 5: Commit**

```bash
git add src/components/ImportDialog.tsx src/lib/i18n/*.ts
git commit -m "feat(import): add ImportDialog with dual MIDI/PDF drop zones"
```

---

---

## Task 8: ScoreLibraryPage 接入新导入 + 删除 + 启动 rescan

**Files:**
- Modify: `desktop/src/components/ScoreLibraryPage.tsx`
- Modify: `desktop/src/App.tsx`(启动时 rescan + 迁移)

- [ ] **Step 1: 改 ScoreLibraryPage 的导入逻辑**

Read `desktop/src/components/ScoreLibraryPage.tsx` 完整内容。替换导入区与 `handleImport`/`handleDelete`:

把顶部 import 改为:
```typescript
import { parseSmf } from "@/lib/smf-parser";
import { loadMidi, deleteMidi } from "@/lib/midi-storage"; // 保留:旧 custom 仍可能命中
import { importScore, loadScoreMidi, deleteScore, listScores } from "@/lib/score-storage";
import { migrateIndexedDbToFs } from "@/lib/score-storage/migration";
import { toast } from "sonner";
import type { ScoreDifficulty } from "@/store/useScoreLibraryStore";
import { ImportDialog, type ImportDialogResult } from "@/components/ImportDialog";
```

(注意:旧 `saveMidi` 不再导入;`loadMidi`/`deleteMidi` 暂留作兼容,Task 8 后若确认无用可删,但保守起见保留。)

把 `handleSelect` 里"Custom imported MIDI"分支(原 `loadMidi(entry.id)`)改为先尝试新存储:
```typescript
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
```

替换 `handleImport` 整个函数为打开 ImportDialog:
```typescript
  const [importOpen, setImportOpen] = useState(false);

  const handleImport = () => setImportOpen(true);

  const handleImportConfirm = async (r: ImportDialogResult) => {
    try {
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
    } catch (err) {
      toast.error(t("toast.load_failed", { msg: String(err) }));
      throw err; // let dialog show the error
    }
  };
```

替换 `handleDelete` 为:
```typescript
  const handleDelete = async (entry: ScoreEntry) => {
    if (!confirm(t("score_delete.confirm"))) return;
    removeCustomScore(entry.id);
    // Prefer file-system delete; legacy IDB delete as best-effort fallback.
    try {
      await deleteScore(entry.id);
    } catch {
      await deleteMidi(entry.id).catch(() => {});
    }
    toast.success(t("score_delete.delete"));
  };
```

在 JSX 的 import 按钮之后、`</header>` 之前(或组件 return 末尾)挂载 ImportDialog:
```tsx
          <Button variant="outline" size="sm" onClick={handleImport}>
            <FileUp className="mr-1 h-3 w-3" />
            {t("score.import")}
          </Button>
        </div>
      </header>
      {/* ... existing filters ... */}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onConfirm={handleImportConfirm} />
```

确保 `useState` 已从 react 导入(顶部 import 行加 `useState` 若未有)。

- [ ] **Step 2: App.tsx 启动时迁移 + rescan**

Read `desktop/src/App.tsx` 顶部 import 区,加:
```typescript
import { migrateIndexedDbToFs } from "@/lib/score-storage/migration";
import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";
```

在组件内(已有的 useEffect 附近)加一个一次性启动 effect:
```typescript
  // One-time migration + score library scan on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateIndexedDbToFs();
      } catch (err) {
        console.error("[startup] migration failed", err);
      }
      if (cancelled) return;
      await useScoreLibraryStore.getState().rescan();
    })();
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 3: 跑全量测试 + build**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。修复任何类型错误(如 ScoreEntry 字段、ImportDialog props)。

- [ ] **Step 4: 手动冒烟(可选但推荐)**

`npm run tauri dev`,进乐谱练习 → 导入 → 选 `temp/Mad_world_Piano.mid`(+ 可选 PDF)→ 确认曲库出现 → 点进去能正常下落播放。删除能从磁盘清掉(检查 `%LOCALAPPDATA%/com.piano.visualizer/scores/`)。

- [ ] **Step 5: Commit**

```bash
git add src/components/ScoreLibraryPage.tsx src/App.tsx
git commit -m "feat(import): wire ImportDialog + file-system import/delete + startup migration"
```

---

## Task 9: anchor-scroll 锚点插值纯函数

**Files:**
- Create: `desktop/src/lib/pdf/anchor-scroll.ts`
- Test: `desktop/src/test/anchor-scroll.test.ts`

这是 PDF 滚动的核心算法,纯函数,充分测试。

- [ ] **Step 1: 写失败测试**

Create `desktop/src/test/anchor-scroll.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { interpolatePdfY, generateCoarseAnchors } from "@/lib/pdf/anchor-scroll";
import type { PdfAnchor } from "@/lib/score-storage/types";

describe("interpolatePdfY", () => {
  const anchors: PdfAnchor[] = [
    { songTime: 0, pdfY: 0 },
    { songTime: 10, pdfY: 1000 },
    { songTime: 20, pdfY: 2000 },
  ];

  it("returns first anchor pdfY before the first anchor", () => {
    expect(interpolatePdfY(-5, anchors)).toBe(0);
  });

  it("returns last anchor pdfY after the last anchor", () => {
    expect(interpolatePdfY(30, anchors)).toBe(2000);
  });

  it("linearly interpolates between two anchors", () => {
    expect(interpolatePdfY(5, anchors)).toBe(500);
    expect(interpolatePdfY(15, anchors)).toBe(1500);
  });

  it("matches exactly at an anchor", () => {
    expect(interpolatePdfY(10, anchors)).toBe(1000);
  });

  it("returns 0 for empty anchors", () => {
    expect(interpolatePdfY(5, [])).toBe(0);
  });

  it("handles a single anchor (clamp)", () => {
    expect(interpolatePdfY(5, [{ songTime: 3, pdfY: 99 }])).toBe(99);
  });

  it("clamps even when anchors are unsorted", () => {
    const unsorted: PdfAnchor[] = [
      { songTime: 20, pdfY: 2000 },
      { songTime: 0, pdfY: 0 },
      { songTime: 10, pdfY: 1000 },
    ];
    expect(interpolatePdfY(5, unsorted)).toBe(500);
  });

  it("handles duplicate songTime anchors without div-by-zero", () => {
    const dups: PdfAnchor[] = [
      { songTime: 0, pdfY: 0 },
      { songTime: 10, pdfY: 500 },
      { songTime: 10, pdfY: 600 },
      { songTime: 20, pdfY: 1000 },
    ];
    // At songTime 10 the search lands on the first duplicate; any value in
    // [500,600] is acceptable as long as it doesn't throw / NaN.
    const y = interpolatePdfY(10, dups);
    expect(y).toBeGreaterThanOrEqual(500);
    expect(y).toBeLessThanOrEqual(600);
    expect(Number.isNaN(y)).toBe(false);
  });
});

describe("generateCoarseAnchors", () => {
  it("distributes duration evenly across pages", () => {
    const anchors = generateCoarseAnchors({ duration: 100, pageCount: 5, pageHeight: 800 });
    expect(anchors).toHaveLength(5);
    expect(anchors[0]).toEqual({ songTime: 0, pdfY: 0 });
    expect(anchors[4]).toEqual({ songTime: 80, pdfY: 3200 });
  });

  it("returns single anchor for one page", () => {
    const anchors = generateCoarseAnchors({ duration: 50, pageCount: 1, pageHeight: 1000 });
    expect(anchors).toEqual([{ songTime: 0, pdfY: 0 }]);
  });

  it("handles zero duration safely", () => {
    const anchors = generateCoarseAnchors({ duration: 0, pageCount: 3, pageHeight: 500 });
    expect(anchors.every((a) => a.songTime === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- anchor-scroll`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 anchor-scroll.ts**

Create `desktop/src/lib/pdf/anchor-scroll.ts`:

```typescript
// Pure functions mapping MIDI playback time to a PDF y pixel coordinate via
// piecewise-linear interpolation over user/maintenance-defined anchors.
// The PDF view shares the MIDI clock, so this mapping is what keeps the
// displayed score position synced with the falling notes / audio.

import type { PdfAnchor } from "@/lib/score-storage/types";

/**
 * Map a song time (seconds) to a PDF y coordinate (pixels from top) using
 * piecewise-linear interpolation over `anchors`. Anchors are sorted by
 * songTime internally. Time before the first / after the last anchor is
 * clamped. Empty anchors return 0.
 */
export function interpolatePdfY(songTime: number, anchors: PdfAnchor[]): number {
  if (anchors.length === 0) return 0;
  if (anchors.length === 1) return anchors[0].pdfY;

  const sorted = [...anchors].sort((a, b) => a.songTime - b.songTime);

  if (songTime <= sorted[0].songTime) return sorted[0].pdfY;
  const last = sorted[sorted.length - 1];
  if (songTime >= last.songTime) return last.pdfY;

  // Binary search for the segment [lo, hi) containing songTime.
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].songTime <= songTime) lo = mid;
    else hi = mid;
  }
  const a = sorted[lo];
  const b = sorted[hi];
  const dt = b.songTime - a.songTime;
  if (dt <= 0) {
    // Duplicate songTime: prefer the lower-index anchor value (stable).
    return a.pdfY;
  }
  const ratio = (songTime - a.songTime) / dt;
  return a.pdfY + ratio * (b.pdfY - a.pdfY);
}

/**
 * Build an initial set of evenly-spaced anchors for a freshly opened PDF:
 * one anchor per page top, distributing the song duration uniformly. These are
 * a rough starting point the user can refine manually.
 */
export function generateCoarseAnchors(input: {
  duration: number;
  pageCount: number;
  pageHeight: number;
}): PdfAnchor[] {
  const { duration, pageCount, pageHeight } = input;
  const n = Math.max(1, pageCount);
  const anchors: PdfAnchor[] = [];
  for (let i = 0; i < n; i++) {
    anchors.push({
      songTime: (duration * i) / n,
      pdfY: pageHeight * i,
    });
  }
  return anchors;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- anchor-scroll`
Expected: PASS。

- [ ] **Step 5: 跑全量测试 + build**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/anchor-scroll.ts src/test/anchor-scroll.test.ts
git commit -m "feat(pdf): add anchor interpolation for songTime→pdfY mapping"
```

---

## Task 10: pdf-viewer.ts (pdf.js 懒加载封装)

**Files:**
- Create: `desktop/src/lib/pdf/pdf-viewer.ts`

pdf.js 封装,动态 import,按需渲染可视页。无单测(canvas 在 happy-dom 不可用),靠 Task 11 集成验证。先确认依赖。

- [ ] **Step 1: 安装 pdfjs-dist**

Run:
```powershell
cd desktop; npm install pdfjs-dist@^4 ; cd ..
```
Expected: 安装成功,`package.json` 出现 `pdfjs-dist`。

- [ ] **Step 2: 写 pdf-viewer.ts**

Create `desktop/src/lib/pdf/pdf-viewer.ts`:

```typescript
// Thin wrapper over pdf.js (pdfjs-dist), lazily loaded so the main bundle is
// unaffected. Renders a virtualized vertical strip of PDF pages to a canvas
// host element and exposes the total scrollable height (needed for anchors).
//
// Rendering itself can't run under happy-dom (no real canvas), so this module
// is only exercised in the live app; the songTime→page logic lives in
// anchor-scroll.ts and is unit-tested separately.

type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(opts: { scale: number }): { width: number; height: number };
    render(opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void> };
  }>;
  destroy(): Promise<void>;
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // Configure the worker as a module worker bundled by Vite.
      // pdfjs-dist v4 ships pdf.worker.mjs alongside pdf.mjs.
      try {
        // @ts-expect-error workerSrc is a pdf.js global config
        mod.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
      } catch {
        // ignore — fallback to fake worker
      }
      return mod;
    });
  }
  return pdfjsPromise;
}

export interface PdfViewerHandle {
  /** Total scrollable height in CSS pixels (sum of all page heights). */
  scrollableHeight: number;
  /** Number of pages. */
  pageCount: number;
  /** Rendered page height (CSS px), uniform across pages. */
  pageHeight: number;
  /** Update which pages are visible; re-renders the visible window ±1 page. */
  scrollToY(y: number): Promise<void>;
  /** Release pdf.js resources and revoke the blob URL. */
  destroy(): void;
}

/**
 * Open a PDF from raw bytes into a host element. Pages are stacked vertically
 * inside `host`. The host should be a scroll container; we append one canvas
 * per page and only paint the visible ones.
 */
export async function openPdfViewer(
  bytes: Uint8Array,
  host: HTMLElement,
  targetWidth: number,
): Promise<PdfViewerHandle> {
  const pdfjs = await getPdfjs();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const loadingTask = pdfjs.getDocument({ url });
  const doc = (await loadingTask.promise) as unknown as PdfDoc;

  // First page establishes the scale: render so page width == targetWidth.
  const firstPage = await doc.getPage(1);
  const baseViewport = firstPage.getViewport({ scale: 1 });
  const scale = targetWidth / baseViewport.width;
  const pageHeight = baseViewport.height * scale;

  const pageCount = doc.numPages;
  const scrollableHeight = pageHeight * pageCount;

  // Build the canvas stack inside the host.
  host.innerHTML = "";
  host.style.position = "relative";
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < pageCount; i++) {
    const c = document.createElement("canvas");
    c.width = Math.round(targetWidth);
    c.height = Math.round(pageHeight);
    c.style.position = "absolute";
    c.style.left = "0";
    c.style.top = `${i * pageHeight}px`;
    c.style.width = `${targetWidth}px`;
    c.style.height = `${pageHeight}px`;
    host.appendChild(c);
    canvases.push(c);
  }
  host.style.height = `${scrollableHeight}px`;

  const rendered = new Set<number>();
  async function renderPage(pageIndex: number): Promise<void> {
    if (rendered.has(pageIndex)) return;
    const canvas = canvases[pageIndex];
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      const page = await doc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale });
      await page.render({ canvasContext: ctx, viewport }).promise;
      rendered.add(pageIndex);
    } catch (err) {
      console.error(`[pdf-viewer] render page ${pageIndex + 1} failed`, err);
    }
  }

  async function scrollToY(y: number): Promise<void> {
    const firstVisible = Math.max(0, Math.floor(y / pageHeight) - 1);
    const lastVisible = Math.min(pageCount - 1, Math.ceil((y + host.clientHeight) / pageHeight) + 1);
    // Render visible window; clear far-away canvases to free memory is optional
    // (kept simple here — re-render is idempotent via the `rendered` set).
    for (let i = firstVisible; i <= lastVisible; i++) {
      void renderPage(i);
    }
  }

  function destroy(): void {
    void doc.destroy().catch(() => {});
    URL.revokeObjectURL(url);
    host.innerHTML = "";
  }

  return { scrollableHeight, pageCount, pageHeight, scrollToY, destroy };
}
```

- [ ] **Step 3: build 确认 pdfjs-dist 类型 + worker 配置无误**

Run: `npm run build`
Expected: 干净。若 worker URL 报错,改用字符串 workerSrc(见注释 fallback)。

- [ ] **Step 4: 跑全量测试(确认无回归)**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdf/pdf-viewer.ts package.json package-lock.json
git commit -m "feat(pdf): add lazy-loaded pdf.js viewer wrapper"
```

---

## Task 11: PdfScoreView 组件 + 锚点滚动 + 自动粗锚点

**Files:**
- Create: `desktop/src/components/PdfScoreView.tsx`
- Modify: 6 个 i18n 文件 + `types.ts`(view_mode.pdf, pdf 编辑锚点文案)

PDF 展示视图。读当前 song 的 meta(含 anchors),打开 pdf.js viewer,RAF 跟随 currentSongTime 滚动。首次打开 anchors 为空时生成粗锚点并写回 meta。

- [ ] **Step 1: 新增 i18n 文案**

`types.ts` 在 `view_mode` 块加 `pdf: string;`,并新增 `pdf_view` 块:
```typescript
  view_mode: {
    waterfall: string;
    staff: string;
    pdf: string;
  };
  pdf_view: {
    edit_anchors: string;
    add_anchor_here: string;
    use_current_time: string;
    no_pdf: string;
  };
```

`zh-CN.ts`:
```typescript
  view_mode: {
    waterfall: "瀑布流",
    staff: "五线谱",
    pdf: "PDF 曲谱",
  },
  pdf_view: {
    edit_anchors: "编辑锚点",
    add_anchor_here: "在此添加锚点",
    use_current_time: "使用当前播放时间",
    no_pdf: "该曲目没有 PDF 曲谱",
  },
```

`en.ts`:
```typescript
  view_mode: {
    waterfall: "Waterfall",
    staff: "Staff",
    pdf: "PDF Score",
  },
  pdf_view: {
    edit_anchors: "Edit Anchors",
    add_anchor_here: "Add anchor here",
    use_current_time: "Use current playback time",
    no_pdf: "This score has no PDF",
  },
```

`ja.ts`:
```typescript
  view_mode: {
    waterfall: "瀑布",
    staff: "五線譜",
    pdf: "PDF 楽譜",
  },
  pdf_view: {
    edit_anchors: "アンカーを編集",
    add_anchor_here: "ここにアンカーを追加",
    use_current_time: "現在の再生時間を使用",
    no_pdf: "この楽譜には PDF がありません",
  },
```

`es.ts`:
```typescript
  view_mode: {
    waterfall: "Cascada",
    staff: "Pentagrama",
    pdf: "Partitura PDF",
  },
  pdf_view: {
    edit_anchors: "Editar anclas",
    add_anchor_here: "Añadir ancla aquí",
    use_current_time: "Usar tiempo de reproducción actual",
    no_pdf: "Esta partitura no tiene PDF",
  },
```

`fr.ts`:
```typescript
  view_mode: {
    waterfall: "Cascade",
    staff: "Portée",
    pdf: "Partition PDF",
  },
  pdf_view: {
    edit_anchors: "Éditer les ancres",
    add_anchor_here: "Ajouter une ancre ici",
    use_current_time: "Utiliser le temps de lecture actuel",
    no_pdf: "Cette partition n'a pas de PDF",
  },
```

`de.ts`:
```typescript
  view_mode: {
    waterfall: "Wasserfall",
    staff: "Notensystem",
    pdf: "PDF-Noten",
  },
  pdf_view: {
    edit_anchors: "Anker bearbeiten",
    add_anchor_here: "Anker hier hinzufügen",
    use_current_time: "Aktuelle Wiedergabezeit verwenden",
    no_pdf: "Diese Partitur hat kein PDF",
  },
```

- [ ] **Step 2: 写 PdfScoreView.tsx**

Create `desktop/src/components/PdfScoreView.tsx`:

```typescript
// PDF score display view: renders the imported PDF via pdf.js and scrolls it
// in sync with MIDI playback time using the score's anchors. First open
// generates coarse anchors if none exist (saved back to meta.json).
//
// This is a presentation-only view: no falling notes, no hit detection, no
// scoring. User keystrokes still sound via the synth; the listen-only toggle
// controls the demo audio as usual.

import { useEffect, useRef, useState } from "react";
import { useSongStore } from "@/store/useSongStore";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useScoreLibraryStore } from "@/store/useScoreLibraryStore";
import { loadScorePdf, readScoreMeta, saveScoreMeta } from "@/lib/score-storage";
import { openPdfViewer, type PdfViewerHandle } from "@/lib/pdf/pdf-viewer";
import { interpolatePdfY, generateCoarseAnchors } from "@/lib/pdf/anchor-scroll";
import { useT } from "@/lib/i18n";

export function PdfScoreView() {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PdfViewerHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPdf, setHasPdf] = useState(true);

  const song = useSongStore((s) => s.song);

  // Find the current score's folder id. The song name alone isn't unique, so
  // match against the library by name + duration.
  const currentFolder = useScoreLibraryStore((s) => {
    const m = s.customScores.find(
      (e) => e.name === song?.name && Math.abs(e.duration - (song?.duration ?? 0)) < 1.5,
    );
    return m?.id ?? null;
  });

  // Open the PDF once the folder is known.
  useEffect(() => {
    let destroyed = false;
    const host = hostRef.current;
    if (!host || !currentFolder) {
      setHasPdf(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setHasPdf(true);

    (async () => {
      try {
        const bytes = await loadScorePdf(currentFolder);
        if (!bytes || bytes.length === 0) {
          if (!destroyed) { setHasPdf(false); setLoading(false); }
          return;
        }
        const width = host.clientWidth || 800;
        const handle = await openPdfViewer(bytes, host, width);
        if (destroyed) { handle.destroy(); return; }
        viewerRef.current = handle;

        // Ensure anchors exist; generate coarse ones on first open.
        const meta = await readScoreMeta(currentFolder);
        if (meta && song && (!meta.pdfScroll || meta.pdfScroll.anchors.length === 0)) {
          const anchors = generateCoarseAnchors({
            duration: song.duration,
            pageCount: handle.pageCount,
            pageHeight: handle.pageHeight,
          });
          const updated = {
            ...meta,
            pdfScroll: {
              mode: "follow" as const,
              scrollableHeight: handle.scrollableHeight,
              anchors,
            },
          };
          await saveScoreMeta(currentFolder, updated);
          (meta as any).pdfScroll = updated.pdfScroll;
        }
        if (!destroyed) setLoading(false);
      } catch (err) {
        console.error("[PdfScoreView] open failed", err);
        if (!destroyed) { setHasPdf(false); setLoading(false); }
      }
    })();

    return () => {
      destroyed = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [currentFolder, song?.name, song?.duration]);

  // RAF loop: scroll PDF to the interpolated y for current song time.
  useEffect(() => {
    let raf = 0;
    const loop = async () => {
      const viewer = viewerRef.current;
      const folder = currentFolder;
      if (viewer && folder && song) {
        const pb = usePlaybackStore.getState();
        const songT = pb.currentSongTime(song);
        // Read anchors from a cached meta (re-read is cheap but throttled by RAF).
        const meta = await readScoreMeta(folder);
        if (meta?.pdfScroll) {
          const y = interpolatePdfY(songT, meta.pdfScroll.anchors);
          viewer.scrollToY(y);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [currentFolder, song]);

  if (!hasPdf) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        {t("pdf_view.no_pdf")}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg-0">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-muted">…</div>
      )}
      <div ref={hostRef} className="h-full w-full overflow-y-auto" />
    </div>
  );
}
```

> 注意:RAF 里每帧 `readScoreMeta` 触发一次磁盘 I/O 在原生下是 invoke,可能偏重。优化:用 `useRef` 缓存最近一次 meta,仅在 anchors 变化(锚点编辑后)时刷新。实现者可加一个 `metaCacheRef` + 在锚点保存后 invalidate。本 plan 先保留正确性,性能优化留到验收后。

- [ ] **Step 3: build + 测试**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 4: Commit**

```bash
git add src/components/PdfScoreView.tsx src/lib/i18n/*.ts
git commit -m "feat(pdf): add PdfScoreView with anchor-synced scrolling"
```

---

## Task 12: AnchorEditorOverlay 手动标注

**Files:**
- Create: `desktop/src/components/AnchorEditorOverlay.tsx`
- Modify: `desktop/src/components/PdfScoreView.tsx`(挂载 overlay + 切换编辑态)

用户在 PDF 上点击 → 弹出"使用当前播放时间"按钮 → 把当前 songTime + 点击 y 存为新锚点 → 写回 meta。可删除锚点。

- [ ] **Step 1: 写 AnchorEditorOverlay.tsx**

Create `desktop/src/components/AnchorEditorOverlay.tsx`:

```typescript
// Overlay for manually adding/removing PDF↔MIDI anchors. Click on the PDF to
// mark a candidate y; a small popover offers "use current playback time" to
// pin that y to the current songTime. Existing anchors show as draggable
// markers with a delete button. All edits are persisted to meta.json.

import { useCallback, useEffect, useState } from "react";
import { usePlaybackStore } from "@/store/usePlaybackStore";
import { useSongStore } from "@/store/useSongStore";
import { readScoreMeta, saveScoreMeta } from "@/lib/score-storage";
import type { PdfAnchor, ScoreMeta } from "@/lib/score-storage/types";

interface Props {
  folder: string | null;
  hostRef: React.RefObject<HTMLDivElement | null>;
  /** Force PdfScoreView to re-read meta after we save. */
  onChanged: () => void;
}

export function AnchorEditorOverlay({ folder, hostRef, onChanged }: Props) {
  const [pending, setPending] = useState<{ y: number } | null>(null);
  const [anchors, setAnchors] = useState<PdfAnchor[]>([]);
  const [metaVersion, setMetaVersion] = useState(0);
  const song = useSongStore((s) => s.song);

  // Load current anchors whenever folder/meta changes.
  useEffect(() => {
    if (!folder) { setAnchors([]); return; }
    let cancelled = false;
    (async () => {
      const meta = await readScoreMeta(folder);
      if (!cancelled) setAnchors(meta?.pdfScroll?.anchors ?? []);
    })();
    return () => { cancelled = true; };
  }, [folder, metaVersion]);

  const onHostClick = useCallback((e: React.MouseEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const y = e.clientY - rect.top + host.scrollTop;
    setPending({ y });
  }, [hostRef]);

  const pinWithCurrentTime = useCallback(async () => {
    if (!pending || !folder || !song) return;
    const pb = usePlaybackStore.getState();
    const songTime = pb.currentSongTime(song);
    const meta = (await readScoreMeta(folder)) as ScoreMeta | null;
    if (!meta) return;
    const list = [...(meta.pdfScroll?.anchors ?? []), { songTime, pdfY: pending.y }];
    list.sort((a, b) => a.songTime - b.songTime);
    const updated: ScoreMeta = {
      ...meta,
      pdfScroll: { mode: "follow", scrollableHeight: meta.pdfScroll?.scrollableHeight ?? 0, anchors: list },
    };
    await saveScoreMeta(folder, updated);
    setPending(null);
    setMetaVersion((v) => v + 1);
    onChanged();
  }, [pending, folder, song, onChanged]);

  const removeAnchor = useCallback(async (idx: number) => {
    if (!folder) return;
    const meta = (await readScoreMeta(folder)) as ScoreMeta | null;
    if (!meta?.pdfScroll) return;
    const list = meta.pdfScroll.anchors.filter((_, i) => i !== idx);
    await saveScoreMeta(folder, { ...meta, pdfScroll: { ...meta.pdfScroll, anchors: list } });
    setMetaVersion((v) => v + 1);
    onChanged();
  }, [folder, onChanged]);

  if (!folder) return null;

  return (
    <div
      className="absolute inset-0 z-10 cursor-crosshair"
      onClick={onHostClick}
    >
      {/* Existing anchors */}
      {anchors.map((a, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 flex items-center"
          style={{ top: a.pdfY }}
        >
          <div className="h-0.5 flex-1 bg-blue-500/60" />
          <button
            className="ml-1 rounded bg-red-500/80 px-1 text-xs text-white"
            onClick={(e) => { e.stopPropagation(); void removeAnchor(i); }}
          >
            ×
          </button>
          <span className="ml-1 rounded bg-blue-500/80 px-1 text-xs text-white">
            {a.songTime.toFixed(1)}s
          </span>
        </div>
      ))}
      {/* Pending candidate */}
      {pending && (
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded bg-bg-1 p-1 shadow"
          style={{ top: pending.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="rounded bg-blue-500 px-2 py-0.5 text-xs text-white"
            onClick={() => void pinWithCurrentTime()}
          >
            + anchor @ {usePlaybackStore.getState().currentSongTime(song!).toFixed(1)}s
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: PdfScoreView 挂载 overlay + 编辑切换**

Modify `desktop/src/components/PdfScoreView.tsx` — 在组件内加编辑态与按钮,并把 overlay 放在 host 之上:

在 imports 加:
```typescript
import { AnchorEditorOverlay } from "@/components/AnchorEditorOverlay";
```

在 `PdfScoreView` 组件 return 前,加 state:
```typescript
  const [editing, setEditing] = useState(false);
  const [metaTick, setMetaTick] = useState(0);
```

把 return 块替换为:
```tsx
  return (
    <div className="relative h-full w-full overflow-hidden bg-bg-0">
      <div className="absolute right-2 top-2 z-20">
        <button
          className={"rounded px-2 py-1 text-xs " + (editing ? "bg-blue-500 text-white" : "bg-bg-2 text-muted")}
          onClick={() => setEditing((v) => !v)}
        >
          {t("pdf_view.edit_anchors")}
        </button>
      </div>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-muted">…</div>
      )}
      <div ref={hostRef} className="relative h-full w-full overflow-y-auto">
        {editing && (
          <AnchorEditorOverlay
            folder={currentFolder}
            hostRef={hostRef}
            onChanged={() => setMetaTick((v) => v + 1)}
          />
        )}
      </div>
      {/* metaTick forces re-read; referenced so it isn't tree-shaken */}
      <span className="hidden">{metaTick}</span>
    </div>
  );
```

> 注意:host 现在 `position: relative`,overlay 用 `absolute inset-0` 覆盖在 PDF canvas 上。编辑模式下 RAF 滚动仍跑(只读),但用户点击事件被 overlay 捕获。

- [ ] **Step 3: build + 测试**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 4: Commit**

```bash
git add src/components/AnchorEditorOverlay.tsx src/components/PdfScoreView.tsx
git commit -m "feat(pdf): add manual anchor editor overlay"
```

---

## Task 13: Stage PDF 视图分支 + App 三选一切换 UI

**Files:**
- Modify: `desktop/src/components/Stage.tsx`
- Modify: `desktop/src/App.tsx`

最后接线:Stage 在 pdf 视图时渲染 PdfScoreView 替代 canvas 内容(但仍保留 RAF 推进 playback);App 工具栏加 PDF 切换按钮。

- [ ] **Step 1: Stage 加 PDF 视图分支**

Modify `desktop/src/components/Stage.tsx`。核心思路:当 `viewMode === "pdf"` 时,渲染层交给 `PdfScoreView`,canvas 仍可隐藏。但 Stage 的 canvas 不可移除(其它模式用),所以做法是:在 Stage 外层(App)渲染 PdfScoreView 覆盖 canvas。

更简洁的方案:**不在 Stage 内嵌 PdfScoreView**,而在 App.tsx 里,当 `viewMode==="pdf"` 时用 PdfScoreView 覆盖 Stage。这样 Stage 不改,只改 App。

先在 Stage 顶部加一个 prop 或直接读 store 控制 canvas 显隐。Stage 当前签名是无参的 `Stage()`。最小改动:Stage 内部读 viewMode,若 pdf 则 `return null`(让出渲染),由 App 叠加 PdfScoreView。

Modify `desktop/src/components/Stage.tsx` — 在 RAF loop 的开头获取 viewMode 后,若为 pdf 则跳过 canvas 绘制(但保留 playback 推进)。改动点:

在 `const viewMode = useScoreViewStore.getState().mode;`(行 90)之后,加:
```typescript
        if (viewMode === "pdf") {
          // PDF view renders elsewhere (App overlays PdfScoreView). Still keep
          // the RAF alive to advance playback so audio + PDF scroll stay live.
          raf = requestAnimationFrame(loop);
          return;
        }
```
注意:这段要放在 `ctx.clearRect` 之前(行 84),即:
```typescript
        const viewMode = useScoreViewStore.getState().mode;
        if (viewMode === "pdf") {
          raf = requestAnimationFrame(loop);
          return;
        }
        ctx.clearRect(0, 0, layout.width, layout.height);
```
但 viewMode 当前在行 90(grid 判断处)才读。把它提前到 clearRect 之前。最终 loop 开头结构调整:

```typescript
    const loop = () => {
      const layout = layoutRef.current;
      if (layout) {
        const input = useInputStore.getState();
        const practiceStore = usePracticeStore.getState();
        const settings = useSettingsStore.getState();
        const songStore = useSongStore.getState();
        const pb = usePlaybackStore.getState();
        const song = songStore.song;
        const now = performance.now() / 1000;
        const dt = Math.min(now - lastTime, 0.05);
        lastTime = now;

        const viewMode = useScoreViewStore.getState().mode;

        // 0) Playback scheduling must keep running even in PDF view so audio
        //    + PDF scroll stay in sync. End-of-song + scheduling happen below
        //    regardless of view mode; only the visual canvas draw is skipped.
        const songT = pb.currentSongTime(song);

        if (pb.isPlaying && !pb.loop && pb.abLoop.b === null && song &&
            song.duration > 0 && songT >= song.duration) {
          usePlaybackStore.setState({ isPlaying: false, playStartSongT: song.duration, playStartCtx: 0 });
        }

        if (pb.isPlaying && song) {
          const mode = useAppModeStore.getState().mode;
          const listenOnly = usePlaybackModeStore.getState().listenOnly;
          const demoAudio = mode === "score-practice" ? listenOnly : !practiceStore.enabled;
          schedulePlayback(song, pb, demoAudio, settings.synthEnabled);
        }

        if (viewMode === "pdf") {
          // PDF view is rendered by App (PdfScoreView overlay). Skip canvas draw.
          input.pruneWrongFlash(now);
          input.pruneHistory(now);
          raf = requestAnimationFrame(loop);
          return;
        }

        ctx.clearRect(0, 0, layout.width, layout.height);
        // ... rest of existing draw code unchanged ...
```
(把原本在行 90-119 的 viewMode 读取、grid 判断、schedulePlayback 段按上述重组:schedulePlayback 移到 pdf 判断之前,end-of-song 也前移。原本的 viewMode 变量重复声明要去掉。)

同时:Stage 在 pdf 视图下应隐藏 canvas。在 Stage return 处,canvas 仍渲染但 `className` 加条件透明:
```tsx
  const viewMode = useScoreViewStore.getState().mode;
  return <canvas ref={canvasRef} className={"block h-full w-full " + (viewMode === "pdf" ? "opacity-0" : "")} />;
```
(避免在 RAF 外读 store 导致不重渲染——这里用一次读取即可,因为切回非 pdf 时用户会触发重渲染;若不生效,改为 `useScoreViewStore((s) => s.mode)` 订阅。)

- [ ] **Step 2: App.tsx 渲染 PdfScoreView + PDF 切换按钮**

Modify `desktop/src/App.tsx`:

imports 加:
```typescript
import { PdfScoreView } from "@/components/PdfScoreView";
```

在 Stage 渲染处(找到 `<Stage />`),用条件叠加 PdfScoreView:
```tsx
  const viewMode = useScoreViewStore((s) => s.mode);
  {/* ... */}
  <div className="relative flex-1">
    <Stage />
    {viewMode === "pdf" && (
      <div className="absolute inset-0">
        <PdfScoreView />
      </div>
    )}
  </div>
```
(具体包裹取决于现有 Stage 在 App 中的容器;实现者按现有布局把 Stage 包进 `relative` 容器,叠加 PdfScoreView。)

在视图切换 UI(原 waterfall/staff 两个按钮,行 402-422)追加 PDF 按钮:
```tsx
               <Button
                  variant={viewMode === "pdf" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2"
                  disabled={!hasPdfCurrent}
                  onClick={() => setViewMode("pdf")}
                  title={t("view_mode.pdf")}
               >
                 <FileText className="h-3 w-3" />
               </Button>
```
其中 `hasPdfCurrent` 表示当前曲目是否有 PDF:
```tsx
  const currentScoreEntry = useScoreLibraryStore((s) =>
    s.customScores.find(
      (e) => e.name === song?.name && Math.abs(e.duration - (song?.duration ?? 0)) < 1.5,
    ),
  );
  const hasPdfCurrent = !!currentScoreEntry?.hasPdf;
```
需 `import { FileText } from "lucide-react"`(若未导入)。

- [ ] **Step 3: 跑全量测试 + build**

Run: `npm test`
Run: `npm run build`
Expected: 全部 PASS / 干净。

- [ ] **Step 4: 手动验收(端到端)**

`npm run tauri dev`:
1. 乐谱练习 → 导入 Mad_world_Piano.mid + Mad_world_Piano.pdf → 曲库出现。
2. 点曲进入 → 工具栏 PDF 按钮可点 → 切到 PDF 视图。
3. 播放:MIDI 声音正常,PDF 跟随滚动。
4. 暂停/继续:PDF 位置同步。
5. 编辑锚点:点 PDF → "use current time" → PDF 滚动贴合改善。
6. 切回 waterfall/staff 正常。
7. 重启应用:迁移跳过(已有 .migrated),曲库正常加载。
8. 删除曲目:磁盘文件夹被删。

- [ ] **Step 5: 更新 AGENTS.md**

在 AGENTS.md 的 Key Rules 里,把 src-tauri 例外写清楚:
```
2. Never modify `src-tauri/`, `scripts/`, `node_modules/`, `dist/`
   EXCEPTION: scores filesystem subsystem (get_scores_root / list_score_folders
   / delete_score_folder in src-tauri/src/lib.rs) is permitted when extending
   the score storage feature.
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Stage.tsx src/App.tsx AGENTS.md
git commit -m "feat(pdf): wire PdfScoreView into Stage/App and add 3-way view toggle"
```

---

## 验收清单

- [ ] `npm test` 全部通过(189 + 新增 slug/score-storage/migration/anchor-scroll/score-library-store ≈ 215+)。
- [ ] `npm run build` 干净无错。
- [ ] `cargo check`(src-tauri)通过。
- [ ] 导入 MIDI+PDF → 磁盘生成文件夹 + 3 文件。
- [ ] 重启应用 → 迁移跳过、曲库加载。
- [ ] PDF 视图跟随 MIDI 滚动,暂停继续同步。
- [ ] 锚点编辑 + 持久化生效。
- [ ] 无 PDF 曲目 PDF 按钮灰掉。
- [ ] 删除曲目清理磁盘。
- [ ] 6 语言文案齐全。

## 风险与回滚

- **pdf.js worker 打包**:若 `npm run build` 报 worker URL 错,改用 `pdfjs.GlobalWorkerOptions.workerSrc = "https://..."` CDN(仅 dev)或 `?url` import。已留 fallback。
- **迁移原子性**:失败不清旧库、不写标记,下次重试。最坏情况旧数据在 IndexedDB 仍在,可手动恢复。
- **回滚**:每个 task 独立 commit,`git revert` 单 task 即可。Rust 命令移除不影响旧 IndexedDB 路径(旧代码仍在 midi-storage.ts)。


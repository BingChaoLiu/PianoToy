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
    // Walk keys with a cursor and delete any under this folder prefix.
    const prefix = folder + "/";
    const cursorReq = store.openKeyCursor();
    cursorReq.onsuccess = () => {
      const cur = cursorReq.result;
      if (cur) {
        if (typeof cur.key === "string" && cur.key.startsWith(prefix)) {
          store.delete(cur.key);
        }
        cur.continue();
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

// Browser/dev fallback: store progress.json bytes in IndexedDB, mirroring
// score-storage/web-fallback.ts. Only used when NOT under Tauri (e.g. `npm run
// dev` in a plain browser). Production runs under Tauri and uses native.ts.

const DB_NAME = "piano-progress-fallback";
const STORE = "kv";
const KEY = "progress.json";

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

/** Read progress.json bytes, or null if never written. */
export async function readProgressBytes(): Promise<Uint8Array | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => {
      const result = req.result;
      resolve(result instanceof Uint8Array ? result : null);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Write progress.json bytes. */
export async function saveProgressBytes(bytes: Uint8Array): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bytes, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

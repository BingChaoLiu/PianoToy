// MIDI binary storage using IndexedDB.
// Works in both Tauri WebView2 and browser - data persists to disk
// via the WebView's profile directory (Tauri) or browser storage (web).

let idbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open("piano-midi-store", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("midi");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

export async function saveMidi(id: string, bytes: Uint8Array): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("midi", "readwrite");
    tx.objectStore("midi").put(bytes, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadMidi(id: string): Promise<Uint8Array | null> {
  try {
    const db = await getDB();
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction("midi", "readonly");
      const req = tx.objectStore("midi").get(id);
      req.onsuccess = () => resolve((req.result as Uint8Array) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteMidi(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("midi", "readwrite");
    tx.objectStore("midi").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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

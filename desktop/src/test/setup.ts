import "@testing-library/jest-dom/vitest";

// happy-dom 20 doesn't reliably expose localStorage on the global, so we provide
// a minimal in-memory polyfill that zustand `persist` can use.
if (typeof globalThis.localStorage === "undefined" || !globalThis.localStorage.clear) {
  const store = new Map<string, string>();
  const ls: Storage = {
    get length() { return store.size; },
    key(i: number) { return Array.from(store.keys())[i] ?? null; },
    getItem(k: string) { return store.has(k) ? store.get(k)! : null; },
    setItem(k: string, v: string) { store.set(k, String(v)); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
  };
  Object.defineProperty(globalThis, "localStorage", { value: ls, writable: true, configurable: true });
}

/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

// Read version from src-tauri/tauri.conf.json so the updater can compare.
const tauriConf = JSON.parse(
  readFileSync(path.resolve(__dirname, "./src-tauri/tauri.conf.json"), "utf-8"),
);

// TypeScript types for the global define injected via `define`.
declare const __APP_VERSION__: string;

// webmscore ships its WASM + data as sibling files (webmscore.lib.wasm ~9MB,
// .mem.wasm ~4MB, .data ~4MB, .symbols ~5MB). The library's Emscripten glue
// resolves them via locateFile against its own URL. We copy these files into
// both the dev server root and the build output's webmscore/ subdir so the
// worker can fetch them at a stable absolute path (/webmscore/...).
const WEBMSCORE_PKG = path.resolve(__dirname, "./node_modules/webmscore");
const WEBMSCORE_ASSET_DIR = "webmscore"; // served at /webmscore in dev + prod

// --- webmscore source patch (asset-URL injection) -------------------------
// webmscore spawns its OWN internal Web Worker (from a Blob URL) that runs
// the WASM, and bakes a global `MSCORE_SCRIPT_URL` into that worker via a
// string template:
//   var MSCORE_SCRIPT_URL = "${MSCORE_SCRIPT_URL$1}";
// Vite's dep optimizer leaves `MSCORE_SCRIPT_URL$1` unresolved (it's a free
// global reference), so at runtime the value is undefined → the inner
// worker's locateFile resolves asset paths against an invalid base → Vite
// serves index.html → the library tries to compile HTML as WASM ("expected
// magic word 00 61 73 6d, found 3c 21 64 6f") and aborts.
//
// Top-level `define` does NOT propagate into Vite 8's Rolldown-optimized
// deps, and plugin `transform` hooks don't run during dep optimization. So
// we patch the SOURCE file directly at config-load time (this top-level code
// runs before Vite starts the optimizer) and alias `webmscore` to the
// patched copy. The patched string flows through optimization into the inner
// worker. The value is a runtime expression: `self.location.origin` resolves
// to the app origin in EVERY context — the page, our outer worker, AND
// webmscore's inner blob worker (blob workers inherit the creator's origin).
const WEBMSCORE_PATCHED = path.resolve(WEBMSCORE_PKG, "webmscore.patched.mjs");
function ensurePatchedWebmscore() {
  try {
    const src = readFileSync(path.join(WEBMSCORE_PKG, "webmscore.mjs"), "utf-8");
    const patched = src
      .replace(/\$\{MSCORE_SCRIPT_URL\$\d*\}/g, '"+self.location.origin+"/webmscore/"+"')
      .replace(/\$\{MSCORE_SCRIPT_URL\}/g, '"+self.location.origin+"/webmscore/"+"');
    // Only rewrite if content changed (avoids needless cache invalidation).
    let existing = "";
    try { existing = readFileSync(WEBMSCORE_PATCHED, "utf-8"); } catch { /* not yet */ }
    if (existing !== patched) {
      writeFileSync(WEBMSCORE_PATCHED, patched);
    }
  } catch (err) {
    // If node_modules/webmscore isn't installed yet (e.g. fresh clone before
    // npm install), skip — the alias will resolve to a missing file and the
    // import will fail loudly at runtime, which is the correct behavior.
    console.warn("[vite.config] could not patch webmscore.mjs:", (err as Error).message);
  }
}
ensurePatchedWebmscore();

function copyWebmscoreAssets(destRoot: string) {
  const dest = path.join(destRoot, WEBMSCORE_ASSET_DIR);
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(WEBMSCORE_PKG)) {
    if (f.startsWith("webmscore.lib.")) {
      copyFileSync(path.join(WEBMSCORE_PKG, f), path.join(dest, f));
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "webmscore-assets",
      // Make lib.* available to the dev server (served from /webmscore/...).
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? "";
          if (url.startsWith(`/${WEBMSCORE_ASSET_DIR}/`)) {
            const filename = url.slice(`/${WEBMSCORE_ASSET_DIR}/`.length).split("?")[0];
            const filePath = path.join(WEBMSCORE_PKG, filename);
            if (filename.startsWith("webmscore.lib.") && existsSync(filePath)) {
              const buf = readFileSync(filePath);
              res.setHeader("Content-Type", "application/wasm");
              res.setHeader("Content-Length", buf.length.toString());
              res.end(buf);
              return;
            }
          }
          next();
        });
      },
      // Copy lib.* into the build output dir at bundle time.
      writeBundle() {
        copyWebmscoreAssets(path.resolve(__dirname, "./dist"));
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version ?? "0.0.0"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force Vite to load the plain ESM entry (webmscore.mjs), NOT the
      // package.json "browser" field which points at webmscore.cdn.mjs (that
      // build hardcodes jsdelivr CDN URLs and would fetch the WASM online —
      // violating the app's offline-only rule). webmscore.mjs uses Emscripten's
      // locateFile with relative filenames, which we override at runtime in the
      // worker to point at /webmscore/... (served by the plugin above).
      webmscore: WEBMSCORE_PATCHED,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 7777,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
  },
});

/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

// Read version from src-tauri/tauri.conf.json so the updater can compare.
const tauriConf = JSON.parse(
  readFileSync(path.resolve(__dirname, "./src-tauri/tauri.conf.json"), "utf-8"),
);

// TypeScript types for the global define injected via `define`.
declare const __APP_VERSION__: string;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version ?? "0.0.0"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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

// Update detection: uses Tauri updater plugin in production, falls back to
// GitHub API parsing in dev/browser. Both return a normalized UpdateInfo.

/** App version (from tauri.conf.json at build time). */
export const APP_VERSION = __APP_VERSION__;

export interface UpdateInfo {
  /** Whether a newer version is available. */
  available: boolean;
  /** Latest version string (e.g. "1.2.0"), without leading "v". */
  version: string | null;
  /** ISO date string of the release, if known. */
  date: string | null;
  /** Release notes (markdown body from GitHub). */
  notes: string | null;
  /** Download + install function (only in Tauri production builds). */
  downloadAndInstall: ((onProgress?: (downloaded: number, total: number) => void) => Promise<void>) | null;
  /** Error message if the check failed. */
  error: string | null;
  /** Where the check ran. "tauri" = production app, "browser" = dev/web. */
  environment: "tauri" | "browser";
  /** Direct download URL for the platform installer (NSIS .exe), when known. */
  downloadUrl: string | null;
}

/** GitHub owner/repo for release lookups. */
const GH_OWNER = "BingChaoLiu";
const GH_REPO = "PianoToy";

/**
 * Compare two semver-like version strings (without leading 'v').
 * Returns true if `remote` is strictly newer than `local`.
 */
export function isNewerVersion(local: string, remote: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(local);
  const b = parse(remote);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (bv > av) return true;
    if (bv < av) return false;
  }
  return false;
}

/** No-update sentinel returned when versions match. */
const NO_UPDATE: UpdateInfo = {
  available: false,
  version: null,
  date: null,
  notes: null,
  downloadAndInstall: null,
  error: null,
  environment: "browser",
  downloadUrl: null,
};

/**
 * Check for updates. Tries the Tauri updater plugin first (production),
 * falls back to GitHub API (dev/browser). Never throws.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  // Track a Tauri-plugin failure so we can surface it instead of silently
  // degrading to the browser fallback (which hides real production bugs).
  let tauriError: string | null = null;

  // --- Path 1: Tauri updater plugin (production desktop app) ---
  if (isTauri) {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        return {
          available: true,
          version: update.version,
          date: update.date ?? null,
          notes: update.body ?? null,
          downloadAndInstall: async (onProgress) => {
            await update.downloadAndInstall((event) => {
              switch (event.event) {
                case "Started":
                  if (onProgress) onProgress(0, event.data.contentLength ?? 0);
                  break;
                case "Progress":
                  if (onProgress) onProgress(event.data.chunkLength ?? 0, 0);
                  break;
                case "Finished":
                  break;
              }
            });
            // After download completes, relaunch the app.
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          },
          error: null,
          environment: "tauri",
          downloadUrl: null,
        };
      }
      return { ...NO_UPDATE, environment: "tauri" };
    } catch (err) {
      // Don't swallow this silently: a failure here means the production
      // auto-updater is broken, and hiding it makes the dialog fall back to a
      // plain "download page" with no clue why. Record the reason and continue
      // to the GitHub check so the badge still works.
      const msg = err instanceof Error ? err.message : String(err);
      tauriError = msg;
      console.error("[updater] Tauri plugin check failed, falling back to GitHub API", err);
    }
  }

  // --- Path 2: GitHub API fallback (dev/browser, or plugin unavailable) ---
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!resp.ok) {
      return { ...NO_UPDATE, environment: isTauri ? "tauri" : "browser", error: `GitHub API ${resp.status}` };
    }
    const data = await resp.json();
    const remoteVersion = (data.tag_name ?? "").replace(/^v/, "");
    if (!remoteVersion || !isNewerVersion(APP_VERSION, remoteVersion)) {
      return { ...NO_UPDATE, environment: isTauri ? "tauri" : "browser" };
    }
    // Find the Windows NSIS installer asset so the dialog can offer a direct
    // download even when auto-install isn't possible (dev/browser or a Tauri
    // plugin error). Prefer the *_x64-setup.exe asset for this platform.
    const installerUrl = pickInstallerUrl(data.assets ?? []);
    return {
      available: true,
      version: remoteVersion,
      date: data.published_at ?? null,
      notes: data.body ?? null,
      downloadAndInstall: null,
      // Browser/dev can't auto-install; if we got here from a Tauri failure,
      // surface that reason so the user knows auto-update is unavailable.
      error: tauriError,
      environment: isTauri ? "tauri" : "browser",
      downloadUrl: installerUrl,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...NO_UPDATE, environment: isTauri ? "tauri" : "browser", error: tauriError ?? msg };
  }
}

/**
 * Pick the direct download URL for the Windows x64 NSIS installer from a
 * GitHub release's asset list. Returns null if no matching asset is found.
 */
export function pickInstallerUrl(
  assets: Array<{ name?: string; browser_download_url?: string }>,
): string | null {
  const setupSuffix = "_x64-setup.exe";
  const exact = assets.find(
    (a) => typeof a.name === "string" && a.name.endsWith(setupSuffix),
  );
  if (exact?.browser_download_url) return exact.browser_download_url;
  const anyExe = assets.find(
    (a) => typeof a.name === "string" && a.name.endsWith(".exe"),
  );
  return anyExe?.browser_download_url ?? null;
}

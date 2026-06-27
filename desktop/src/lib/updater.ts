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
  downloadAndInstall: (() => Promise<void>) | null;
  /** Error message if the check failed. */
  error: string | null;
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
};

/**
 * Check for updates. Tries the Tauri updater plugin first (production),
 * falls back to GitHub API (dev/browser). Never throws.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  // --- Path 1: Tauri updater plugin (production desktop app) ---
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        return {
          available: true,
          version: update.version,
          date: update.date ?? null,
          notes: update.body ?? null,
          downloadAndInstall: async () => {
            await update.downloadAndInstall((event) => {
              switch (event.event) {
                case "Started":
                case "Progress":
                case "Finished":
                  break;
              }
            });
            // After download completes, relaunch the app.
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          },
          error: null,
        };
      }
      return NO_UPDATE;
    }
  } catch {
    // Fall through to GitHub API fallback.
  }

  // --- Path 2: GitHub API fallback (dev/browser, or plugin unavailable) ---
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!resp.ok) {
      return { ...NO_UPDATE, error: `GitHub API ${resp.status}` };
    }
    const data = await resp.json();
    const remoteVersion = (data.tag_name ?? "").replace(/^v/, "");
    if (!remoteVersion || !isNewerVersion(APP_VERSION, remoteVersion)) {
      return NO_UPDATE;
    }
    return {
      available: true,
      version: remoteVersion,
      date: data.published_at ?? null,
      notes: data.body ?? null,
      // Browser fallback: can't auto-install, so downloadAndInstall is null.
      // The UI will show a "open download page" button instead.
      downloadAndInstall: null,
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...NO_UPDATE, error: msg };
  }
}

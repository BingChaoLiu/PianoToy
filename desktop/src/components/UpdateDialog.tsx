// UpdateDialog: shows version info, release notes, and download/install flow.

import { useState } from "react";
import { X, RotateCw, ExternalLink, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdaterStore } from "@/store/useUpdaterStore";
import { useT } from "@/lib/i18n";

type Phase = "idle" | "downloading" | "installing" | "done" | "error";

export function UpdateDialog() {
  const t = useT();
  const dialogOpen = useUpdaterStore((s) => s.dialogOpen);
  const setDialogOpen = useUpdaterStore((s) => s.setDialogOpen);
  const info = useUpdaterStore((s) => s.updateInfo);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null);

  if (!dialogOpen || !info) return null;

  const version = info.version ?? "";
  const canAutoUpdate = info.downloadAndInstall != null;
  // Auto-install only works in the Tauri desktop runtime. In a browser/dev
  // shell we can only hand the user the installer to download manually.
  const isBrowser = info.environment === "browser";
  const fallbackUrl = info.downloadUrl ?? "https://github.com/BingChaoLiu/PianoToy/releases/latest";

  const handleUpdate = async () => {
    if (!info.downloadAndInstall) return;
    try {
      setPhase("downloading");
      setProgress(null);
      // The Tauri updater relaunches the app once the install finishes.
      // The plugin emits Started (total bytes) then Progress (chunk bytes),
      // so accumulate the downloaded total and track contentLength for %.
      let downloaded = 0;
      let total = 0;
      await info.downloadAndInstall((chunkLen, contentLen) => {
        // Started event reports contentLength in the second arg with chunkLen 0.
        if (contentLen > 0 && total === 0) total = contentLen;
        // Progress event reports chunkLen in the first arg.
        if (chunkLen > 0) downloaded += chunkLen;
        if (total > 0) setProgress({ downloaded, total });
      });
      // If we reach here, install + relaunch started.
      setPhase("done");
    } catch (err) {
      console.error("[updater] download/install failed", err);
      setPhase("error");
      setProgress(null);
    }
  };

  const openDownloadPage = () => {
    window.open(fallbackUrl, "_blank");
    setDialogOpen(false);
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg-0/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-bg-2 bg-bg-1 p-6 shadow-xl">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3"
          onClick={() => setDialogOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>

        <h2 className="mb-1 text-lg font-bold text-fg">{t("updater.title")}</h2>
        <p className="mb-4 text-sm text-muted">
          {t("updater.available_desc").replace("{version}", version)}
        </p>

        {/* Release notes */}
        {info.notes && (
          <div className="mb-4 max-h-40 overflow-y-auto rounded-md bg-bg-2 p-3">
            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted">
              {info.notes}
            </pre>
          </div>
        )}

        {/* Progress bar while the Tauri updater is downloading/installing. */}
        {phase === "downloading" && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-accent">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress && progress.total > 0
                ? t("updater.downloading_progress")
                    .replace("{pct}", String(Math.round((progress.downloaded / progress.total) * 100)))
                : t("updater.downloading")}
            </div>
            {progress && progress.total > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-3">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: Math.min(100, (progress.downloaded / progress.total) * 100) + "%" }}
                />
              </div>
            )}
          </div>
        )}
        {phase === "done" && (
          <div className="mb-4 flex items-center gap-2 text-sm text-accent">
            <Check className="h-4 w-4" />
            {t("updater.install_and_relaunch")}
          </div>
        )}
        {phase === "error" && (
          <div className="mb-4 text-sm text-red-400">{t("updater.check_failed")}</div>
        )}

        {/* Explain why auto-install isn't available when it isn't: a browser/dev
            shell genuinely can't install a desktop app, while a Tauri error
            means the in-app updater itself failed. Previously this silently
            fell back to a bare "download page" button with no explanation. */}
        {!canAutoUpdate && phase === "idle" && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-bg-3 bg-bg-2 p-3 text-xs text-muted">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>
              {info.error
                ? t("updater.auto_unavailable_error") + "\n" + info.error
                : isBrowser
                  ? t("updater.auto_unavailable_browser")
                  : t("updater.auto_unavailable_error")}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {canAutoUpdate && phase !== "downloading" && phase !== "done" && (
            <Button variant="default" size="sm" className="flex-1" onClick={handleUpdate}>
              <RotateCw className="mr-1 h-3 w-3" />
              {t("updater.update_now")}
            </Button>
          )}
          {!canAutoUpdate && (
            <Button variant="default" size="sm" className="flex-1" onClick={openDownloadPage}>
              <ExternalLink className="mr-1 h-3 w-3" />
              {t("updater.download_page")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
            {t("updater.later")}
          </Button>
        </div>
      </div>
    </div>
  );
}

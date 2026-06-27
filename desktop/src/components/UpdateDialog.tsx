// UpdateDialog: shows version info, release notes, download progress.

import { useState } from "react";
import { X, Download, RotateCw, ExternalLink, Check } from "lucide-react";
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

  if (!dialogOpen || !info) return null;

  const version = info.version ?? "";
  const canAutoUpdate = info.downloadAndInstall != null;

  const handleUpdate = async () => {
    if (!info.downloadAndInstall) return;
    try {
      setPhase("downloading");
      await info.downloadAndInstall();
      // If we reach here, install + relaunch started; show "done".
      setPhase("done");
    } catch (err) {
      console.error("[updater] download/install failed", err);
      setPhase("error");
    }
  };

  const openDownloadPage = () => {
    window.open("https://github.com/BingChaoLiu/PianoToy/releases/latest", "_blank");
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

        {/* Progress / status area */}
        {phase === "downloading" && (
          <div className="mb-4 flex items-center gap-2 text-sm text-accent">
            <Download className="h-4 w-4 animate-pulse" />
            {t("updater.downloading")}
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

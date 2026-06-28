// VersionFooter: persistent bottom-right widget on the HomePage.
// Shows the app version with a check-for-updates button whose behaviour is
// state-aware: spinner while checking, new-version indicator when available
// (click opens the update dialog), and toasts on manual "up to date"/error.

import { RefreshCw, CheckCircle2, ArrowDownCircle } from "lucide-react";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/updater";
import { useUpdaterStore } from "@/store/useUpdaterStore";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function VersionFooter() {
  const t = useT();
  const status = useUpdaterStore((s) => s.status);
  const updateInfo = useUpdaterStore((s) => s.updateInfo);
  const check = useUpdaterStore((s) => s.check);
  const setDialogOpen = useUpdaterStore((s) => s.setDialogOpen);

  const isChecking = status === "checking";
  const hasUpdate = status === "available";
  const remoteVersion = updateInfo?.version ?? "";

  // Behaviour depends on current state:
  //  - checking: disabled (spinner shown)
  //  - available: opens the update dialog
  //  - otherwise: runs a manual check and toasts the result
  const handleClick = async () => {
    if (isChecking) return;
    if (hasUpdate) {
      setDialogOpen(true);
      return;
    }
    const result = await check();
    if (result === "upToDate") {
      toast.success(t("updater.up_to_date"));
    } else if (result === "error") {
      toast.error(t("updater.check_failed"));
    }
    // "available" is reflected by the new-version indicator; no toast needed.
  };

  return (
    <button
      type="button"
      disabled={isChecking}
      onClick={handleClick}
      title={
        isChecking
          ? t("updater.checking")
          : hasUpdate
            ? t("updater.available_desc").replace("{version}", remoteVersion)
            : t("updater.check")
      }
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
        isChecking
          ? "cursor-wait text-muted"
          : hasUpdate
            ? "text-accent hover:bg-bg-2"
            : "text-muted hover:bg-bg-2 hover:text-fg",
      )}
    >
      {isChecking ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : hasUpdate ? (
        <span className="relative flex items-center">
          <ArrowDownCircle className="h-3.5 w-3.5" />
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" />
      )}
      {hasUpdate ? (
        <span className="font-medium">
          {t("updater.new_version")} v{remoteVersion}
        </span>
      ) : (
        <span>v{APP_VERSION}</span>
      )}
    </button>
  );
}

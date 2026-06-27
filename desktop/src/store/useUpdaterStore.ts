// Update detection store: caches the result of a silent update check on startup.

import { create } from "zustand";
import { checkForUpdate, type UpdateInfo } from "@/lib/updater";

export type UpdateState = "idle" | "checking" | "available" | "upToDate" | "error";

interface UpdaterStore {
  status: UpdateState;
  updateInfo: UpdateInfo | null;
  /** Whether the update dialog is open. */
  dialogOpen: boolean;

  /** Run a silent update check (safe to call multiple times). */
  check: () => Promise<void>;
  /** Dismiss the badge / clear state to upToDate. */
  dismiss: () => void;
  /** Open or close the update dialog. */
  setDialogOpen: (open: boolean) => void;
}

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  status: "idle",
  updateInfo: null,
  dialogOpen: false,

  check: async () => {
    if (get().status === "checking") return;
    set({ status: "checking" });
    try {
      const info = await checkForUpdate();
      set({
        status: info.available ? "available" : info.error ? "error" : "upToDate",
        updateInfo: info,
      });
    } catch (err) {
      set({
        status: "error",
        updateInfo: null,
      });
      console.error("[updater] check failed", err);
    }
  },

  dismiss: () => set({ status: "upToDate" }),
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}));

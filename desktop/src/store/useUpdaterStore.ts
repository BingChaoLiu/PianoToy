// Update detection store: caches the result of a silent update check on startup.

import { create } from "zustand";
import { checkForUpdate, type UpdateInfo } from "@/lib/updater";

export type UpdateState = "idle" | "checking" | "available" | "upToDate" | "error";

interface UpdaterStore {
  status: UpdateState;
  updateInfo: UpdateInfo | null;
 /** Whether the update dialog is open. */
 dialogOpen: boolean;

  /**
   * Run an update check. Returns the resulting status so callers (e.g. a
   * manual "check for updates" button) can react with toasts.
   * Safe to call multiple times; concurrent calls are coalesced.
   */
  check: () => Promise<UpdateState>;
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
   if (get().status === "checking") return "checking";
   set({ status: "checking" });
   try {
     const info = await checkForUpdate();
     const next: UpdateState = info.available
       ? "available"
       : info.error
         ? "error"
         : "upToDate";
     set({ status: next, updateInfo: info });
     return next;
   } catch (err) {
     set({ status: "error", updateInfo: null });
     console.error("[updater] check failed", err);
     return "error";
   }
 },

  dismiss: () => set({ status: "upToDate" }),
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}));

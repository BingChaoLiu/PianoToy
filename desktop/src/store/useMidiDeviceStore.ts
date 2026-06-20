// MIDI device store: merges Web MIDI and native (midir) backends.
// - Web devices are enumerated via navigator.requestMIDIAccess and updated
//   on hot-plug events.
// - Native devices are enumerated via Tauri commands and require a refresh
//   to pick up newly connected ports.
// Selection is exclusive: switching backends tears the previous one down.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  openMidi, collectInputs, subscribeInput, unsubscribeAll,
  type MidiHandle, type MidiInputInfo, type MidiSource,
} from "@/lib/midi-input";
import {
  listNativeMidiInputs, startNativeMidiListen, stopNativeMidiListen,
  subscribeNativeMidi, type NativeMidiDevice,
} from "@/lib/native-midi";

export type { MidiSource } from "@/lib/midi-input";
export type { NativeMidiDevice } from "@/lib/native-midi";

type MidiListener = (status: number, data1: number, data2: number) => void;

interface MidiDeviceState {
  initialized: boolean;
  /** True if at least one backend (web or native) is ready. */
  supported: boolean;
  /** Merged list of native + web devices. */
  inputs: MidiInputInfo[];
  selectedId: string | null;
  /** Live Web MIDI access; null when Web MIDI is unavailable. */
  handle: MidiHandle | null;
  /** Disposer for the native event subscription (set only while a native device is selected). */
  nativeUnlisten: (() => void) | null;

  init: () => Promise<void>;
  /** Re-enumerate both backends. Safe to call multiple times. */
  refresh: () => Promise<void>;
  /** Select a device by id (exclusive). No-op if id is unknown. */
  select: (id: string, listener: MidiListener) => Promise<void>;
  /** Re-bind the listener to the already-selected device. */
  setListener: (listener: MidiListener) => void;
  /** Tear down both backends and clear selection. */
  close: () => void;
}

function sourceOf(id: string): MidiSource {
  return id.startsWith("native:") ? "native" : "web";
}

function mapNative(devices: NativeMidiDevice[]): MidiInputInfo[] {
  return devices.map((d) => ({ id: d.id, name: d.name, source: "native" as const }));
}

function mergeInputs(native: MidiInputInfo[], web: MidiInputInfo[]): MidiInputInfo[] {
  // Native devices first; de-dup by name to avoid showing the same physical
  // device twice when both backends report it.
  const seen = new Set(native.map((n) => n.name));
  const webFiltered = web.filter((w) => !seen.has(w.name));
  return [...native, ...webFiltered];
}

export const useMidiDeviceStore = create<MidiDeviceState>()(
  persist(
    (set, get) => ({
      initialized: false,
      supported: false,
      inputs: [],
      selectedId: null,
      handle: null,
      nativeUnlisten: null,

      init: async () => {
        if (get().initialized) return;
        await get().refresh();
        set({ initialized: true });
      },

      refresh: async () => {
        // Discard the prior web statechange handler so it does not leak
        // across refreshes.
        const oldHandle = get().handle;
        if (oldHandle) oldHandle.access.onstatechange = null;

        const [webHandle, nativeList] = await Promise.all([
          openMidi(),
          listNativeMidiInputs(),
        ]);

        let webInputs: MidiInputInfo[] = [];
        if (webHandle) {
          webInputs = collectInputs(webHandle.access);
          webHandle.access.onstatechange = () => {
            const fresh = collectInputs(webHandle.access);
            const cur = mapNative(nativeList);
            set({ inputs: mergeInputs(cur, fresh) });
          };
        }

        const nativeMapped = mapNative(nativeList);
        const supported = webHandle != null || nativeList.length > 0;

        set({
          supported,
          inputs: mergeInputs(nativeMapped, webInputs),
          handle: webHandle ?? get().handle,
        });
      },

      select: async (id, listener) => {
        // Tear down any prior subscriptions on either backend so the user
        // never receives duplicated events.
        const state = get();
        if (state.nativeUnlisten) {
          state.nativeUnlisten();
        }
        if (state.handle) {
          unsubscribeAll(state.handle.access);
        }
        try { await stopNativeMidiListen(); } catch { /* may not be listening */ }
        set({ nativeUnlisten: null });

        if (!state.inputs.some((i) => i.id === id)) {
          set({ selectedId: null });
          return;
        }

        if (sourceOf(id) === "native") {
          const portName = id.slice("native:".length);
          try {
            await startNativeMidiListen(portName);
            const unlisten = await subscribeNativeMidi(listener);
            set({ selectedId: id, nativeUnlisten: unlisten });
          } catch (err) {
            console.error("[midi] native listen failed:", err);
            set({ selectedId: null });
          }
        } else {
          if (!state.handle) {
            set({ selectedId: null });
            return;
          }
          const ok = subscribeInput(state.handle.access, id, (msg) => {
            const [status, d1, d2] = msg.data;
            listener(status, d1, d2);
          });
          if (ok) set({ selectedId: id });
        }
      },

      setListener: (listener) => {
        const { handle, selectedId, nativeUnlisten } = get();
        if (!selectedId) return;

        if (sourceOf(selectedId) === "native") {
          if (nativeUnlisten) nativeUnlisten();
          subscribeNativeMidi(listener).then((unlisten) => {
            if (unlisten) set({ nativeUnlisten: unlisten });
          });
        } else if (handle) {
          subscribeInput(handle.access, selectedId, (msg) => {
            const [status, d1, d2] = msg.data;
            listener(status, d1, d2);
          });
        }
      },

      close: () => {
        const { handle, nativeUnlisten } = get();
        if (nativeUnlisten) nativeUnlisten();
        void stopNativeMidiListen().catch(() => {});
        if (handle) {
          unsubscribeAll(handle.access);
          handle.access.onstatechange = null;
        }
        set({
          handle: null,
          inputs: [],
          selectedId: null,
          nativeUnlisten: null,
          initialized: false,
        });
      },
    }),
    {
      name: "piano.midi",
      version: 2,
      partialize: (s) => ({ selectedId: s.selectedId }),
    },
  ),
);

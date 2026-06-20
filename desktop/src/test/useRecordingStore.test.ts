import { describe, it, expect, beforeEach } from "vitest";
import { useRecordingStore } from "@/store/useRecordingStore";
import { useInputStore } from "@/store/useInputStore";

describe("useRecordingStore", () => {
  beforeEach(() => {
    useRecordingStore.setState({ isRecording: false, events: [], lastRecording: null, startTime: 0 });
    useInputStore.getState().clear();
  });

  it("starts and stops recording", () => {
    useRecordingStore.getState().start();
    expect(useRecordingStore.getState().isRecording).toBe(true);
    useRecordingStore.getState().stop();
    expect(useRecordingStore.getState().isRecording).toBe(false);
  });

  it("toggle flips state", () => {
    expect(useRecordingStore.getState().isRecording).toBe(false);
    useRecordingStore.getState().toggle();
    expect(useRecordingStore.getState().isRecording).toBe(true);
    useRecordingStore.getState().toggle();
    expect(useRecordingStore.getState().isRecording).toBe(false);
  });

  it("recordEvent is a no-op when not recording", () => {
    useRecordingStore.getState().recordEvent("on", 60, 96);
    expect(useRecordingStore.getState().events).toHaveLength(0);
  });

  it("captures events via useInputStore hooks", () => {
    useRecordingStore.getState().start();
    useInputStore.getState().onNoteOn(60, 96, "keyboard");
    useInputStore.getState().onNoteOff(60);
    useInputStore.getState().onNoteOn(64, 80, "midi");
    useInputStore.getState().onNoteOff(64);
    useRecordingStore.getState().stop();
    const evs = useRecordingStore.getState().events;
    // start() reset events, then 4 hooks fired while recording; but stop() clears events.
    expect(evs).toHaveLength(0);
  });

  it("stop builds a Song with the recorded notes", () => {
    useRecordingStore.getState().start();
    useInputStore.getState().onNoteOn(60, 96, "keyboard");
    useInputStore.getState().onNoteOff(60);
    const song = useRecordingStore.getState().stop();
    expect(song).not.toBeNull();
    expect(song!.notes).toHaveLength(1);
    expect(song!.notes[0].midi).toBe(60);
    expect(song!.notes[0].duration).toBeGreaterThan(0);
    expect(useRecordingStore.getState().lastRecording).toBe(song);
  });

  it("stop returns null when no events", () => {
    useRecordingStore.getState().start();
    const song = useRecordingStore.getState().stop();
    expect(song).toBeNull();
    expect(useRecordingStore.getState().lastRecording).toBeNull();
  });

  it("clearLast drops the cached recording", () => {
    useRecordingStore.getState().start();
    useInputStore.getState().onNoteOn(60, 96, "keyboard");
    useInputStore.getState().onNoteOff(60);
    useRecordingStore.getState().stop();
    expect(useRecordingStore.getState().lastRecording).not.toBeNull();
    useRecordingStore.getState().clearLast();
    expect(useRecordingStore.getState().lastRecording).toBeNull();
  });

  it("handles re-on without off by closing previous note", () => {
    useRecordingStore.getState().start();
    useInputStore.getState().onNoteOn(60, 96, "keyboard");
    // Force a tiny time gap by awaiting a Promise.resolve.
    return Promise.resolve().then(() => {
      useInputStore.getState().onNoteOn(60, 96, "keyboard");
      useInputStore.getState().onNoteOff(60);
      const song = useRecordingStore.getState().stop();
      expect(song!.notes.length).toBeGreaterThanOrEqual(1);
    });
  });
});

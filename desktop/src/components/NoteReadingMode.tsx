// Note-reading mode shell (T6): switches between the course browser (home base)
// and the practice stage. The browser launches either a daily-mix session or a
// level-scoped drill; the stage runs it; exiting practice returns to the
// browser with a bumped reloadKey so statuses refresh from the persisted card
// state updated during the session.

import { useState } from "react";
import { CourseBrowser } from "@/components/CourseBrowser";
import { NoteReadingStage } from "@/components/NoteReadingStage";
import { NoteReadingSummary } from "@/components/NoteReadingSummary";
import { useNoteReadingStore } from "@/store/useNoteReadingStore";
import { useInputStore } from "@/store/useInputStore";

type SubView = "browser" | "practice";

export function NoteReadingMode({
  onOpenSettings,
  onExitHome,
}: {
  onOpenSettings: () => void;
  onExitHome: () => void;
}) {
  const [subView, setSubView] = useState<SubView>("browser");
  // Bumped each time a practice session ends so the browser reloads its
  // derived statuses from the now-updated persisted card state.
  const [reloadKey, setReloadKey] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  // --- Launchers (browser → practice) ---
  const startDailyMix = async () => {
    await useNoteReadingStore.getState().startSession();
    setSubView("practice");
  };

  const startLevel = async (levelId: string) => {
    await useNoteReadingStore.getState().startLevelSession(levelId);
    setSubView("practice");
  };

  // --- Exit handlers (practice → browser/home) ---
  const handleStageExit = () => {
    const s = useNoteReadingStore.getState();
    // A challenge run that ended shows its own result panel with onExit=here;
    // treat that as a normal return to the browser (no double summary).
    if (s.runEnded && s.practiceMode === "challenge") {
      void returnToBrowser();
      return;
    }
    const answered = (s.session?.correctCount ?? 0) + (s.session?.wrongCount ?? 0);
    if (answered > 0) {
      setShowSummary(true);
      return;
    }
    // Nothing practiced — drop straight back to the browser.
    void returnToBrowser();
  };

  // Retry: re-launch the same scope (daily-mix or level) in the current mode.
  const handleRetry = async () => {
    const scope = useNoteReadingStore.getState().sessionScope;
    if (scope === "daily-mix" || scope === null) {
      await useNoteReadingStore.getState().startSession();
    } else {
      await useNoteReadingStore.getState().startLevelSession(scope);
    }
  };

  const returnToBrowser = async () => {
    await useNoteReadingStore.getState().exitSession();
    useInputStore.getState().clear();
    setShowSummary(false);
    setReloadKey((k) => k + 1);
    setSubView("browser");
  };

  if (subView === "browser") {
    return (
      <div className="relative h-full w-full">
        {/* key forces a fresh mount so the browser re-derives statuses after a
            practice session updates the persisted card state. */}
        <CourseBrowser
          key={reloadKey}
          onExit={onExitHome}
          onStartDailyMix={startDailyMix}
          onStartLevel={startLevel}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <NoteReadingStage
        onOpenSettings={onOpenSettings}
        onExit={handleStageExit}
        onRetry={handleRetry}
      />
      {showSummary && (
        <NoteReadingSummary
          onClose={() => {
            void returnToBrowser();
          }}
        />
      )}
    </div>
  );
}

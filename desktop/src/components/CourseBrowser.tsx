// Course browser (T6, generalized in T8): the note-reading mode's home base.
//
// Shows all branches — active ones render their levels (each with a derived
// status: locked/ready/in-progress/mastered); coming-soon ones render a locked
// placeholder. The "daily mix" card plays the full T4 queue across all
// unlocked levels of all active branches.
//
// Status derivation is pure (course.levelStatus); this component only loads the
// persisted card state, renders, and routes launches.

import { useEffect, useState } from "react";
import { ArrowLeft, Play, Lock, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  BRANCHES,
  levelStatus,
  type Branch,
  type Level,
  type CourseState,
  type LevelStatus,
} from "@/lib/course";
import { buildDailyQueue } from "@/lib/daily-queue";
import { DEFAULT_THRESHOLD, DEFAULT_NEW_CARDS_PER_DAY } from "@/lib/practice-controller";
import { loadProgress, type ProgressFile } from "@/lib/progress-storage";
import { courseStateFromProgress } from "@/store/useNoteReadingStore";

/** Map a branch id to its i18n name key. */
const BRANCH_NAME_KEY: Record<string, string> = {
  "reading-recognition": "course.branch_reading",
  "keyboard-location": "course.branch_keyboard",
  "interval-recognition": "course.branch_interval",
  "key-signature-recognition": "course.branch_key_signature",
};

export function CourseBrowser({
  onExit,
  onStartDailyMix,
  onStartLevel,
}: {
  onExit: () => void;
  onStartDailyMix: () => void;
  onStartLevel: (levelId: string) => void;
}) {
  const t = useT();
  const [state, setState] = useState<CourseState | null>(null);

  // Load persisted card state → derive statuses. Reloads whenever `reloadKey`
  // changes (the parent bumps it after a practice session ends so statuses
  // refresh — AC6).
  useEffect(() => {
    let cancelled = false;
    void loadProgress(DEFAULT_THRESHOLD).then((p: ProgressFile) => {
      if (cancelled) return;
      setState(courseStateFromProgress(p));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg-0 text-fg">
        <p className="text-sm text-muted">{t("reading.loading")}</p>
      </div>
    );
  }

  // Daily-queue summary: due cards (urgent) + capped new cards.
  const now = Date.now();
  const queue = buildDailyQueue(state, now, { newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY });
  const totalCount = queue.length;

  return (
    <div className="flex h-full w-full flex-col bg-bg-0 text-fg">
      <header className="flex items-center justify-between border-b border-bg-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("reading.back")}
          </Button>
          <span className="text-xs text-muted">{t("course.title")}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Daily mix CTA */}
        <DailyMixCard
          totalCount={totalCount}
          onStart={onStartDailyMix}
        />

        {/* Active branches — each renders its levels */}
        {BRANCHES.filter((b) => b.status === "active").map((branch) => (
          <BranchSection key={branch.id} branch={branch} t={t}>
            {branch.levels.map((level) => (
              <LevelRow
                key={level.id}
                level={level}
                status={levelStatus(state, level.id)}
                t={t}
                onStart={() => onStartLevel(level.id)}
              />
            ))}
          </BranchSection>
        ))}

        {/* Coming-soon branches */}
        {BRANCHES.filter((b) => b.status === "coming-soon").map((branch) => (
          <ComingSoonBranch key={branch.id} branch={branch} t={t} />
        ))}
      </div>
    </div>
  );
}

// --- Daily mix CTA ----------------------------------------------------------

function DailyMixCard({
  totalCount,
  onStart,
}: {
  totalCount: number;
  onStart: () => void;
}) {
  const t = useT();
  const subtitle =
    totalCount > 0 ? t("course.cards_due_today", { n: totalCount }) : t("course.review_cleared");
  return (
    <button
      onClick={onStart}
      disabled={totalCount === 0}
      className={
        "mb-5 flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 text-left transition-colors " +
        (totalCount === 0 ? "opacity-50" : "hover:bg-accent/20")
      }
    >
      <Sparkles className="h-6 w-6 shrink-0 text-accent" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-fg">{t("course.daily_mix")}</p>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      <Play className="h-4 w-4 text-accent" />
    </button>
  );
}

// --- Branch section ---------------------------------------------------------

function BranchSection({
  branch,
  t,
  children,
}: {
  branch: Branch;
  t: (k: string, p?: Record<string, string | number>) => string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {t(BRANCH_NAME_KEY[branch.id] ?? "course.branch_reading")}
      </h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

// --- Level row --------------------------------------------------------------

function LevelRow({
  level,
  status,
  t,
  onStart,
}: {
  level: Level;
  status: LevelStatus;
  t: (k: string, p?: Record<string, string | number>) => string;
  onStart: () => void;
}) {
  // A level is launchable unless it's locked. Mastered levels stay replayable
  // so the learner can review/drill them again (AC4: "selecting an unlocked
  // level launches the session" — mastered levels are still unlocked).
  const playable = status !== "locked";
  return (
    <button
      onClick={playable ? onStart : undefined}
      disabled={!playable}
      className={
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors " +
        (status === "mastered"
          ? "border-accent/30 bg-accent/5 hover:bg-accent/10"
          : playable
            ? "border-bg-3 bg-bg-1 hover:bg-bg-2"
            : "border-bg-2 bg-bg-1 opacity-50")
      }
    >
      <StatusIcon status={status} />
      <div className="flex-1">
        <p className="text-sm font-medium text-fg">{t(level.titleKey)}</p>
      </div>
      <StatusBadge status={status} t={t} />
    </button>
  );
}

function StatusIcon({ status }: { status: LevelStatus }) {
  switch (status) {
    case "mastered":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />;
    case "ready":
    case "in-progress":
      return <Circle className="h-4 w-4 shrink-0 text-muted" />;
    case "locked":
      return <Lock className="h-4 w-4 shrink-0 text-muted" />;
  }
}

function StatusBadge({
  status,
  t,
}: {
  status: LevelStatus;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const label =
    status === "mastered"
      ? t("course.status_mastered")
      : status === "in-progress"
        ? t("course.status_in_progress")
        : status === "ready"
          ? t("course.status_ready")
          : t("course.status_locked");
  return <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{label}</span>;
}

// --- Coming-soon branch -----------------------------------------------------

function ComingSoonBranch({
  branch,
  t,
}: {
  branch: Branch;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {t(BRANCH_NAME_KEY[branch.id] ?? "course.branch_reading")}
      </h2>
      <div className="flex items-center gap-3 rounded-lg border border-bg-2 bg-bg-1 px-3 py-2.5 opacity-60">
        <Lock className="h-4 w-4 shrink-0 text-muted" />
        <div className="flex-1">
          <p className="text-sm font-medium text-fg">{t(BRANCH_NAME_KEY[branch.id] ?? "course.branch_reading")}</p>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
          {t("course.coming_soon")}
        </span>
      </div>
    </section>
  );
}

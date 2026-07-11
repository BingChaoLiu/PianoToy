// progress.json schema + (de)serialization.
//
// Pure logic: no I/O, no DOM, fully unit-testable. The native/web backends
// (native.ts / web-fallback.ts) and the routing facade (index.ts) build on this.
//
// Schema (decided in T2):
//   { schemaVersion, threshold, cards }
// where `cards` is a plain object keyed by the string form of a CardKey
// (pitch:clef:key) -> the card's SM-2 state. Unlock/mastered state is NOT
// persisted: it's purely derived from `cards` (T3's decision), so storing it
// would create a second source of truth that can drift out of sync.

import type { Card, MasteryThreshold } from "@/lib/sm2";
import { DEFAULT_SM2_CONFIG } from "@/lib/sm2";

/** Bump when the on-disk shape changes. Migrations key off this. */
export const PROGRESS_SCHEMA_VERSION = 1;

/** The on-disk shape. `cards` is a plain object for JSON friendliness. */
export interface ProgressFile {
  schemaVersion: number;
  threshold: MasteryThreshold;
  cards: Record<string, Card>;
}

export function emptyProgress(threshold: MasteryThreshold): ProgressFile {
  return { schemaVersion: PROGRESS_SCHEMA_VERSION, threshold, cards: {} };
}

/** Serialize to a pretty-printed JSON string. */
export function serializeProgress(p: ProgressFile): string {
  return JSON.stringify(p, null, 2);
}

/**
 * Deserialize with defensive parsing: a corrupt or wrong-shaped blob degrades
 * to fresh progress rather than throwing — mirroring `parseListedMetas`.
 * Individual malformed card entries are dropped; valid ones survive.
 *
 * `fallbackThreshold` is used when the blob lacks a usable threshold.
 */
export function deserializeProgress(raw: string, fallbackThreshold: MasteryThreshold): ProgressFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProgress(fallbackThreshold);
  }

  if (!isObject(parsed)) return emptyProgress(fallbackThreshold);

  const threshold = isThreshold(parsed.threshold) ? parsed.threshold : fallbackThreshold;
  const cards: Record<string, Card> = {};
  if (isObject(parsed.cards)) {
    for (const [key, value] of Object.entries(parsed.cards)) {
      const card = coerceCard(value);
      if (card) cards[key] = card;
    }
  }

  return { schemaVersion: PROGRESS_SCHEMA_VERSION, threshold, cards };
}

// --- internal guards ---------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isThreshold(v: unknown): v is MasteryThreshold {
  return isObject(v) && typeof v.ease === "number" && typeof v.intervalDays === "number";
}

/**
 * Coerce a raw value into a valid Card, or null if it can't be salvaged.
 * Required numeric fields must be present and finite; optional timestamps
 * (rma, lastAnswered) default to null when missing/non-finite.
 */
function coerceCard(v: unknown): Card | null {
  if (!isObject(v)) return null;
  const ease = num(v.ease);
  const interval = num(v.interval);
  const reps = num(v.reps);
  const due = num(v.due);
  // The four required SM-2 numerics must all resolve.
  if (ease === null || interval === null || reps === null || due === null) return null;
  // Ease has a hard floor in SM-2; reject anything below it as corrupt.
  if (ease < DEFAULT_SM2_CONFIG.minEase) return null;
  const rma = num(v.rma);
  const lastAnswered = num(v.lastAnswered);
  return {
    ease,
    interval,
    reps,
    due,
    rma: rma === null ? null : rma,
    lastAnswered: lastAnswered === null ? null : lastAnswered,
  };
}

/** Finite number or null (rejects NaN, Infinity, strings, booleans). */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

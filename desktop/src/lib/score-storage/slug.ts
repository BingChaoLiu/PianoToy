// Pure helpers for score folder naming and path-safety validation.

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Convert a human name into a safe single path segment (folder name fragment).
 * Lowercases; replaces spaces and forbidden filename chars with dashes; preserves
 * unicode letters (e.g. Chinese); collapses and trims dashes; falls back to
 * "untitled" when the result is empty; suffixes Windows reserved names.
 */
export function slugify(name: string): string {
  let s = name.toLowerCase();
  // Replace spaces + forbidden filename chars with dashes.
  s = s.replace(/[<>:"/\\|?*\s]+/g, "-");
  // Keep unicode letters/digits and ASCII word chars; turn everything else
  // (ASCII punctuation, emoji/symbols, control chars) into a dash. This keeps
  // slugify's output alphabet exactly in sync with isValidFolderName's
  // unicode-aware allowlist (\p{L}\p{N}_-).
  s = s.replace(/[^\p{L}\p{N}_-]+/gu, "-");
  // Collapse consecutive dashes.
  s = s.replace(/-+/g, "-");
  // Strip leading/trailing dashes and dots.
  s = s.replace(/^[.\-]+|[.\-]+$/g, "");
  if (WINDOWS_RESERVED.test(s)) s += "-";
  return s.length > 0 ? s : "untitled";
}

/** Build a stable score id from import timestamp + name slug. */
export function makeScoreId(timestampSeconds: number, name: string): string {
  return `${timestampSeconds}-${slugify(name)}`;
}

/**
 * Validate a folder name is a safe single segment (no traversal/separator).
 * Accepts the same alphabet slugify can emit: ASCII alphanumerics, dash,
 * underscore, and unicode letters/digits (so CJK titles round-trip). Rejects
 * empty, leading dot, separators, and Windows reserved names.
 */
export function isValidFolderName(folder: string): boolean {
  if (!folder) return false;
  if (folder.startsWith(".")) return false;
  if (folder.includes("/") || folder.includes("\\")) return false;
  if (WINDOWS_RESERVED.test(folder)) return false;
  // Unicode-aware allowlist matching slugify's output alphabet.
  return /^[\p{L}\p{N}_-]+$/u.test(folder);
}

/**
 * Recent searches: the short memory the search palette offers back.
 *
 *   submitted query ──▶ rememberSearch(recents, query) ──▶ recents (max 6)
 *   localStorage    ──▶ loadRecentSearches / saveRecentSearches
 *
 * Parsing is total like the preferences blob: any malformed or missing input
 * falls back to an empty list rather than throwing. Entries are trimmed,
 * case-insensitively deduped (newest first), and length-capped so a pasted
 * essay can never park itself in storage.
 */

export const RECENT_SEARCHES_KEY = "cyberdeck-radio:recent-searches";

export const MAX_RECENT_SEARCHES = 6;

/** Longest query worth remembering; anything beyond this is dropped. */
export const MAX_SEARCH_LENGTH = 60;

function normalizeEntry(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SEARCH_LENGTH) return null;
  return trimmed;
}

/** Total parse: anything unexpected yields an empty list. */
export function parseRecentSearches(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const parsed: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeEntry(entry);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push(normalized);
    if (parsed.length === MAX_RECENT_SEARCHES) break;
  }
  return parsed;
}

/** Move a query to the front of the list, dropping its older twin. */
export function rememberSearch(
  recents: readonly string[],
  query: string,
): string[] {
  const normalized = normalizeEntry(query);
  if (!normalized) return parseRecentSearches(recents);
  const key = normalized.toLowerCase();
  const rest = parseRecentSearches(recents).filter(
    (entry) => entry.toLowerCase() !== key,
  );
  return [normalized, ...rest].slice(0, MAX_RECENT_SEARCHES);
}

export function loadRecentSearches(): string[] {
  try {
    const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    return parseRecentSearches(stored === null ? [] : JSON.parse(stored));
  } catch {
    return [];
  }
}

export function saveRecentSearches(recents: readonly string[]): void {
  try {
    window.localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(parseRecentSearches(recents)),
    );
  } catch {
    // Storage can be unavailable (private mode, quota); recents stay in-memory.
  }
}

/**
 * Local cache of channels whose stream was confirmed offline by the health
 * worker, so the directory, map, facets, and hop pool can drop them instead
 * of offering dead records.
 *
 *   worker "offline" ──▶ quarantine ──▶ localStorage blob
 *   worker "live"    ──▶ restore   ──▶ localStorage blob
 *
 * Same shape as user preferences: one small JSON blob, total parsing, no
 * server. Quarantine is keyed by station id so a reload keeps dead channels
 * hidden until the worker's slow recheck (10–20 min per channel) confirms the
 * stream is back and restores the record.
 */

export const QUARANTINE_STORAGE_KEY = "cyberdeck-radio:quarantine";

const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = readPersistedQuarantine();

function readPersistedQuarantine(): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = window.localStorage.getItem(QUARANTINE_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id !== ""));
  } catch {
    return new Set();
  }
}

function persist(): void {
  try {
    window.localStorage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify([...snapshot]));
  } catch {
    // Private mode or a full quota: the in-memory snapshot still hides the
    // channel for this session; the next live verdict simply finds nothing to
    // delete.
  }
}

function publish(next: ReadonlySet<string>): void {
  if (next === snapshot) return;
  snapshot = next;
  persist();
  for (const listener of listeners) listener();
}

/** Ids currently hidden from the records because their stream is confirmed dead. */
export function getQuarantineSnapshot(): ReadonlySet<string> {
  return snapshot;
}

export function isQuarantined(stationId: string): boolean {
  return snapshot.has(stationId);
}

export function quarantineChannel(stationId: string): void {
  if (snapshot.has(stationId)) return;
  const next = new Set(snapshot);
  next.add(stationId);
  publish(next);
}

export function restoreChannel(stationId: string): void {
  if (!snapshot.has(stationId)) return;
  const next = new Set(snapshot);
  next.delete(stationId);
  publish(next);
}

export function subscribeQuarantine(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: drop every quarantined id and clear the persisted blob. */
export function resetQuarantine(): void {
  snapshot = new Set();
  try {
    window.localStorage.removeItem(QUARANTINE_STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
  for (const listener of listeners) listener();
}

/**
 * The dial log — channels this browser has actually tried to play.
 *
 *   playback loading/playing ──▶ recordChannel ──▶ localStorage
 *   shelf chips ──▶ getRecentChannelsSnapshot ──▶ directory + map + hops
 *
 * Entries are snapshots of the whole channel (see `channel-snapshots`), so
 * history stays tunable across reloads and source switches. Recording the
 * same channel twice only moves it back to the front — the log never repeats
 * a row — and the oldest entries fall off past the cap.
 */

import { createSnapshotStore, type SnapshotStore } from "./channel-snapshots";
import type Station from "./types";

export const RECENT_CHANNELS_STORAGE_KEY = "cyberdeck-radio:recent-channels";

/** Long enough to re-tune yesterday's run, short enough to stay a shelf. */
export const MAX_RECENT_CHANNELS = 24;

const store: SnapshotStore = createSnapshotStore({
  storageKey: RECENT_CHANNELS_STORAGE_KEY,
  limit: MAX_RECENT_CHANNELS,
});

/** Newest-first list of recently played channel snapshots. */
export function getRecentChannelsSnapshot(): readonly Station[] {
  return store.getSnapshot();
}

export function subscribeRecentChannels(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function isChannelRecent(id: string): boolean {
  return store.has(id);
}

export function getRecentChannel(id: string): Station | null {
  return store.get(id);
}

/** Logs a listen. A repeat listen only promotes the existing row. */
export function recordChannel(station: Station): void {
  store.add(station);
}

export function forgetChannel(id: string): void {
  store.remove(id);
}

/** Test hook: drops the whole dial log and clears the persisted blob. */
export function resetRecentChannels(): void {
  store.clear();
}

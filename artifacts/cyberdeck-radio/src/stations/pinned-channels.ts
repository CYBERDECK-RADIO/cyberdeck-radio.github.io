/**
 * Pinned channels — the visitor's own "keep this station" shelf.
 *
 *   dossier pin / row pin ──▶ togglePinnedChannel ──▶ localStorage
 *   shelf chips ──▶ getPinnedChannelsSnapshot ──▶ directory + map + hops
 *
 * Pins are snapshots of the whole channel (see `channel-snapshots`), so the
 * shelf survives reloads, source switches, and catalogs that never re-serve
 * the record. The store is module-wide with a stable snapshot reference, which
 * is what `usePinnedChannels` hands to `useSyncExternalStore`.
 */

import { createSnapshotStore, type SnapshotStore } from "./channel-snapshots";
import type Station from "./types";

export const PINNED_CHANNELS_STORAGE_KEY = "cyberdeck-radio:pinned-channels";

/** A shelf, not an archive: the newest pins evict the oldest past the cap. */
export const MAX_PINNED_CHANNELS = 60;

const store: SnapshotStore = createSnapshotStore({
  storageKey: PINNED_CHANNELS_STORAGE_KEY,
  limit: MAX_PINNED_CHANNELS,
});

/** Newest-first list of pinned channel snapshots. */
export function getPinnedChannelsSnapshot(): readonly Station[] {
  return store.getSnapshot();
}

export function subscribePinnedChannels(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function isChannelPinned(id: string): boolean {
  return store.has(id);
}

export function getPinnedChannel(id: string): Station | null {
  return store.get(id);
}

/** Keeps the channel (or refreshes its place to the front). */
export function pinChannel(station: Station): void {
  store.add(station);
}

export function unpinChannel(id: string): void {
  store.remove(id);
}

/** True when the channel is now pinned, false when the pin was lifted. */
export function togglePinnedChannel(station: Station): boolean {
  if (store.has(station.id)) {
    store.remove(station.id);
    return false;
  }
  store.add(station);
  return true;
}

/** Test hook: drops every pin and clears the persisted blob. */
export function resetPinnedChannels(): void {
  store.clear();
}

import { useSyncExternalStore } from "react";

import { getRecentChannelsSnapshot, subscribeRecentChannels } from "./recent-channels";
import type Station from "./types";

/**
 * The dial log — every channel this browser has tried to play, newest first.
 * Recording is driven by playback, so the shelf fills itself without the
 * visitor ever opening a menu.
 */
export function useRecentChannels(): readonly Station[] {
  return useSyncExternalStore(subscribeRecentChannels, getRecentChannelsSnapshot);
}

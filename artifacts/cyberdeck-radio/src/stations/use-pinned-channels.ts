import { useSyncExternalStore } from "react";

import { getPinnedChannelsSnapshot, subscribePinnedChannels } from "./pinned-channels";
import type Station from "./types";

/**
 * The pinned shelf, newest first, re-rendering every subscriber when a pin is
 * lifted or added — including from the dossier, a directory row, or the
 * `p` keyboard shortcut. Empty until the first pin (or whatever the persisted
 * local shelf already holds).
 */
export function usePinnedChannels(): readonly Station[] {
  return useSyncExternalStore(subscribePinnedChannels, getPinnedChannelsSnapshot);
}

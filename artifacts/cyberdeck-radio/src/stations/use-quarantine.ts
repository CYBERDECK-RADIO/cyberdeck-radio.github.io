import { useSyncExternalStore } from "react";

import {
  getQuarantineSnapshot,
  subscribeQuarantine,
} from "./stream-quarantine";

/**
 * Channels the health worker confirmed offline: hidden from the directory,
 * map, facets, and hop pool until a slow recheck (10–20 min per channel)
 * confirms the stream is live again.
 */
export function useQuarantine(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeQuarantine, getQuarantineSnapshot);
}

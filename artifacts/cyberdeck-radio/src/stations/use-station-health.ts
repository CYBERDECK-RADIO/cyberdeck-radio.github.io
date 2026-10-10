import { useSyncExternalStore } from "react";

import { getHealthSnapshot, getHealthStatus, subscribeHealth } from "./stream-health";
import type { HealthStatus } from "./stream-health-logic";

/**
 * Live view of the background stream-health checks. Returns a map keyed by
 * station id; stations without a result read as "unknown".
 */
export function useStationHealth(): ReadonlyMap<string, HealthStatus> {
  return useSyncExternalStore(subscribeHealth, getHealthSnapshot);
}

export function useStationHealthStatus(stationId: string): HealthStatus {
  const health = useStationHealth();
  return health.get(stationId) ?? getHealthStatus(stationId);
}
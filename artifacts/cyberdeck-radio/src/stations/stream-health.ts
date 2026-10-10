/**
 * Stream-health client: owns the background worker and exposes its status map
 * to React through a stable subscription-friendly snapshot.
 *
 *   stations ──▶ registerStations ──▶ worker 'set'
 *   worker 'health' ──▶ apply (batched) ──▶ listeners ──▶ useStationHealth
 */

import type Station from "./types";
import type { HealthStatus } from "./stream-health-logic";

type HealthRecord = { status: HealthStatus; checkedAt: number | null };

const REFRESH_BATCH_MS = 90;

let worker: Worker | null | undefined;
let statusMap = new Map<string, HealthStatus>();
const listeners = new Set<() => void>();
let flushHandle: ReturnType<typeof setTimeout> | undefined;

function workerSupported(): boolean {
  if (typeof Worker === "undefined") return false;
  if (typeof window !== "undefined" && typeof window.Worker === "undefined") return false;
  return import.meta.env.MODE !== "test";
}

function ensureWorker(): Worker | null {
  if (worker !== undefined) return worker;
  if (!workerSupported()) {
    worker = null;
    return worker;
  }
  try {
    const instance = new Worker(new URL("./stream-health.worker.ts", import.meta.url), {
      type: "module",
    });
    instance.onmessage = (event) => {
      const message = event.data as { type?: string; id?: string; status?: HealthStatus };
      if (message?.type !== "health" || typeof message.id !== "string") return;
      setHealth(message.id, message.status ?? "unknown");
    };
    worker = instance;
  } catch {
    worker = null;
  }
  return worker;
}

export function registerStations(stations: Station[]): void {
  const instance = ensureWorker();
  if (!instance) return;
  instance.postMessage({
    type: "set",
    stations: stations.map((station) => ({ id: station.id, checkUrl: station.checkUrl })),
  });
}

function setHealth(id: string, status: HealthStatus): void {
  const current = statusMap.get(id);
  if (current === status) return;
  statusMap = new Map(statusMap);
  statusMap.set(id, status);
  scheduleNotify();
}

function scheduleNotify(): void {
  if (flushHandle !== undefined) return;
  flushHandle = setTimeout(() => {
    flushHandle = undefined;
    for (const listener of listeners) listener();
  }, REFRESH_BATCH_MS);
}

export function subscribeHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHealthSnapshot(): ReadonlyMap<string, HealthStatus> {
  return statusMap;
}

export function getHealthStatus(stationId: string): HealthStatus {
  return statusMap.get(stationId) ?? "unknown";
}
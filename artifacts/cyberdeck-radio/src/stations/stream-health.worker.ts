/**
 * Background stream-health worker.
 *
 * Holds the pool of stations currently on screen, probes each channel's
 * `checkUrl` on a small concurrency budget, re-checks stale entries on a slow
 * sweep, and posts status changes back to the client. Runs off the UI thread.
 * Channels confirmed offline are re-probed on a slower 10–20 minute cadence:
 * the client quarantines them in a local cache and only needs the worker to
 * notice the stream coming back.
 */

import {
  classifyHealthError,
  classifyHealthResponse,
  OFFLINE_CONFIRMATIONS,
  recheckDelayMs,
  type HealthStatus,
} from "./stream-health-logic";
import { isSecureStreamUrl } from "./secure-stream";

declare const self: {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
};

type PooledStation = {
  id: string;
  checkUrl: string | null;
  status: "unknown" | "live" | "offline" | "checking" | "insecure";
  /** Last verdict held before the in-flight probe overwrote `status` with "checking". */
  heldStatus: "unknown" | "live" | "offline" | "insecure";
  /** Consecutive offline probes; the channel is only reported offline once this reaches OFFLINE_CONFIRMATIONS. */
  offlineStreak: number;
  checkedAt: number | null;
  /** When the sweep may probe this channel again; null means "as soon as a slot frees up". */
  nextCheckAt: number | null;
};

type SetMessage = {
  type: "set";
  stations: Array<{ id: string; checkUrl?: string; streamUrls: string[] }>;
};

type HealthMessage = {
  type: "health";
  id: string;
  status: HealthStatus;
};

const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 6_000;
const SWEEP_INTERVAL_MS = 15_000;

const pool = new Map<string, PooledStation>();
const queue: string[] = [];
const queued = new Set<string>();
let inflight = 0;

self.onmessage = (event: MessageEvent) => {
  const message = event.data as SetMessage;
  if (message?.type !== "set") return;

  const incoming = new Map(message.stations.map((record) => [record.id, record]));
  for (const id of pool.keys()) {
    if (!incoming.has(id)) pool.delete(id);
  }

  for (const [id, record] of incoming) {
    const existing = pool.get(id);
    // A station with no https stream can never be played on an https page, so
    // mark it insecure immediately and never spend a probe on it. The client
    // prunes it from the directory and map as soon as the status arrives.
    const secure = record.streamUrls.some(isSecureStreamUrl);
    if (!secure) {
      pool.set(id, {
        id,
        checkUrl: record.checkUrl ?? null,
        status: "insecure",
        heldStatus: "insecure",
        offlineStreak: 0,
        checkedAt: null,
        nextCheckAt: null,
      });
      self.postMessage({ type: "health", id, status: "insecure" } satisfies HealthMessage);
      continue;
    }
    if (existing && (existing.status === "live" || existing.status === "offline" || existing.status === "checking")) {
      // A quarantined (offline-confirmed) channel reappearing in the results —
      // a fresh search is a good moment to re-verify it immediately instead of
      // waiting out the slow recovery cadence.
      if (existing.status === "offline") existing.nextCheckAt = null;
      continue;
    }
    pool.set(id, {
      id,
      checkUrl: record.checkUrl ?? null,
      status: "unknown",
      heldStatus: "unknown",
      offlineStreak: 0,
      checkedAt: null,
      nextCheckAt: null,
    });
    enqueue(id);
  }
  pump();
};

self.setInterval(() => {
  const now = Date.now();
  for (const entry of pool.values()) {
    const due = entry.nextCheckAt === null || now >= entry.nextCheckAt;
    if (due) enqueue(entry.id);
  }
  pump();
}, SWEEP_INTERVAL_MS);

function enqueue(id: string) {
  if (queued.has(id)) return;
  const entry = pool.get(id);
  if (!entry || entry.status === "checking" || entry.status === "insecure" || !entry.checkUrl)
    return;
  queued.add(id);
  queue.push(id);
}

async function pump() {
  while (queued.size > 0 && inflight < CONCURRENCY) {
    const id = queue.shift();
    if (id === undefined) break;
    queued.delete(id);

    const entry = pool.get(id);
    if (!entry || !entry.checkUrl) continue;
    entry.status = "checking";
    inflight += 1;

    void probe(entry)
      .then((verdict) => settle(id, verdict))
      .catch(() => settle(id, "unknown"))
      .finally(() => {
        inflight -= 1;
        pump();
      });
  }
}

/**
 * Folds one probe verdict into the pool. A single offline strike only holds
 * the previous verdict and schedules a quick confirming probe; the second
 * consecutive strike reports offline (the client quarantines the channel),
 * after which the slow 10–20 minute recovery cadence takes over. Any other
 * verdict resets the streak.
 */
function settle(id: string, verdict: "live" | "offline" | "insecure" | "unknown"): void {
  const current = pool.get(id);
  let posted: HealthStatus = verdict;
  if (current) {
    current.checkedAt = Date.now();
    if (verdict === "offline") {
      current.offlineStreak += 1;
      const confirmed = current.offlineStreak >= OFFLINE_CONFIRMATIONS;
      posted = confirmed ? "offline" : current.heldStatus;
      if (confirmed) {
        current.status = "offline";
        current.heldStatus = "offline";
      } else {
        current.status = current.heldStatus;
      }
      current.nextCheckAt = current.checkedAt + recheckDelayMs("offline", current.offlineStreak);
    } else {
      current.offlineStreak = 0;
      current.status = verdict;
      current.heldStatus = verdict;
      current.nextCheckAt = current.checkedAt + recheckDelayMs(verdict);
    }
  }
  self.postMessage({ type: "health", id, status: posted } satisfies HealthMessage);
}

async function probe(entry: PooledStation): Promise<"live" | "offline" | "insecure" | "unknown"> {
  if (!entry.checkUrl) return "offline";

  let last: "live" | "offline" | "insecure" | "unknown" = "unknown";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = self.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(entry.checkUrl, {
        cache: "no-store",
        headers: { Range: "bytes=0-2048", Accept: "audio/*,*/*" },
        signal: controller.signal,
      });
      const rating = await classifyHealthResponse(response, entry.checkUrl);
      // Cancel the stream body after classification: icecast streams are long,
      // but the radio-browser JSON payload has already been consumed above.
      void response.body?.cancel().catch(() => {});
      return rating;
    } catch (error) {
      last = classifyHealthError(error);
      if (attempt === 0) {
        await new Promise((resolve) => self.setTimeout(resolve, 300));
        continue;
      }
    } finally {
      self.clearTimeout(timeout);
    }
  }
  return last;
}
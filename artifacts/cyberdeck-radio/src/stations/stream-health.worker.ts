/**
 * Background stream-health worker.
 *
 * Holds the pool of stations currently on screen, probes each channel's
 * `checkUrl` on a small concurrency budget, re-checks stale entries on a slow
 * sweep, and posts status changes back to the client. Runs off the UI thread.
 */

import {
  classifyHealthError,
  classifyHealthResponse,
  type HealthStatus,
} from "./stream-health-logic";

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
  status: "unknown" | "live" | "offline" | "checking";
  checkedAt: number | null;
};

type SetMessage = {
  type: "set";
  stations: Array<{ id: string; checkUrl?: string }>;
};

type HealthMessage = {
  type: "health";
  id: string;
  status: HealthStatus;
};

const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 6_000;
const RECHECK_INTERVAL_MS = 5 * 60_000;
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
    if (existing && existing.status !== "unknown") continue;
    pool.set(id, {
      id,
      checkUrl: record.checkUrl ?? null,
      status: "unknown",
      checkedAt: null,
    });
    enqueue(id);
  }
  pump();
};

self.setInterval(() => {
  const now = Date.now();
  for (const entry of pool.values()) {
    const due = entry.checkedAt === null || now - entry.checkedAt >= RECHECK_INTERVAL_MS;
    if (due) enqueue(entry.id);
  }
  pump();
}, SWEEP_INTERVAL_MS);

function enqueue(id: string) {
  if (queued.has(id)) return;
  const entry = pool.get(id);
  if (!entry || entry.status === "checking" || !entry.checkUrl) return;
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
      .then((status) => {
        const current = pool.get(id);
        if (current) {
          current.status = status;
          current.checkedAt = Date.now();
        }
        self.postMessage({ type: "health", id, status } satisfies HealthMessage);
      })
      .catch(() => {
        const current = pool.get(id);
        if (current) {
          current.status = "unknown";
          current.checkedAt = Date.now();
        }
        self.postMessage({ type: "health", id, status: "unknown" } satisfies HealthMessage);
      })
      .finally(() => {
        inflight -= 1;
        pump();
      });
  }
}

async function probe(entry: PooledStation): Promise<"live" | "offline" | "unknown"> {
  if (!entry.checkUrl) return "offline";

  let last: "live" | "offline" | "unknown" = "unknown";
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
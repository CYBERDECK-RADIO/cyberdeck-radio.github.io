// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyHealth, getHealthStatus, registerStations } from "./stream-health";
import {
  getQuarantineSnapshot,
  isQuarantined,
  resetQuarantine,
} from "./stream-quarantine";

describe("stream-health client", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetQuarantine();
  });

  afterEach(() => {
    resetQuarantine();
    window.localStorage.clear();
  });

  it("quarantines a channel when the worker confirms it offline", () => {
    applyHealth("station-1", "offline");

    expect(isQuarantined("station-1")).toBe(true);
    expect(getHealthStatus("station-1")).toBe("offline");
  });

  it("restores a quarantined channel when the worker reports it live again", () => {
    applyHealth("station-1", "offline");
    applyHealth("station-1", "live");

    expect(isQuarantined("station-1")).toBe(false);
    expect(getHealthStatus("station-1")).toBe("live");
  });

  it("leaves the quarantine untouched for live channels that were never removed", () => {
    applyHealth("station-2", "live");

    expect(isQuarantined("station-2")).toBe(false);
    expect(getHealthStatus("station-2")).toBe("live");
  });

  it("keeps insecure and unknown verdicts out of the quarantine", () => {
    applyHealth("station-3", "insecure");
    applyHealth("station-4", "unknown");

    expect(getQuarantineSnapshot().size).toBe(0);
    expect(getHealthStatus("station-3")).toBe("insecure");
    expect(getHealthStatus("station-4")).toBe("unknown");
  });

  it("is a no-op without a worker in the test environment", () => {
    expect(() => registerStations([])).not.toThrow();
  });
});

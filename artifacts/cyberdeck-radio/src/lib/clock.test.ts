import { afterEach, describe, expect, it } from "vitest";

import { formatLocalClock, formatUtcClock } from "./clock";

describe("formatUtcClock", () => {
  it("zero-pads every field", () => {
    expect(formatUtcClock(new Date(Date.UTC(2026, 0, 1, 4, 5, 6)))).toBe("04:05:06");
  });

  it("reads the UTC fields regardless of the local zone", () => {
    expect(formatUtcClock(new Date(Date.UTC(2026, 11, 31, 23, 59, 58)))).toBe("23:59:58");
  });
});

describe("formatLocalClock", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("zero-pads every field", () => {
    const date = new Date(2026, 0, 1, 4, 5, 6);
    expect(formatLocalClock(date)).toBe("04:05:06");
  });

  it("reads the local fields, not UTC", () => {
    process.env.TZ = "America/New_York";
    const date = new Date(Date.UTC(2026, 11, 31, 14, 9, 3));
    expect(formatLocalClock(date)).toBe("09:09:03");
    expect(formatUtcClock(date)).toBe("14:09:03");
  });
});

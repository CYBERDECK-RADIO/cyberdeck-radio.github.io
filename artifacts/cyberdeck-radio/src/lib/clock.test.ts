import { describe, expect, it } from "vitest";

import { formatUtcClock } from "./clock";

describe("formatUtcClock", () => {
  it("zero-pads every field", () => {
    expect(formatUtcClock(new Date(Date.UTC(2026, 0, 1, 4, 5, 6)))).toBe("04:05:06");
  });

  it("reads the UTC fields regardless of the local zone", () => {
    expect(formatUtcClock(new Date(Date.UTC(2026, 11, 31, 23, 59, 58)))).toBe("23:59:58");
  });
});

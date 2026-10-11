import { describe, expect, it } from "vitest";

import {
  SLEEP_TIMER_MINUTES,
  formatSleepRemaining,
  isSleepTimerMinutes,
  sleepDeadline,
} from "./sleep-timer";

describe("sleep timer contract", () => {
  it("offers the durations a bedside radio actually uses", () => {
    expect([...SLEEP_TIMER_MINUTES]).toEqual([15, 30, 45, 60]);
    expect(isSleepTimerMinutes(30)).toBe(true);
    expect(isSleepTimerMinutes(45)).toBe(true);
    expect(isSleepTimerMinutes(7)).toBe(false);
    expect(isSleepTimerMinutes("30")).toBe(false);
  });

  it("formats the countdown as MM:SS and rolls into H:MM:SS", () => {
    expect(formatSleepRemaining(30 * 60_000)).toBe("30:00");
    expect(formatSleepRemaining(29 * 60_000 + 59_500)).toBe("30:00");
    expect(formatSleepRemaining(1_500)).toBe("00:02");
    expect(formatSleepRemaining(0)).toBe("00:00");
    expect(formatSleepRemaining(-5_000)).toBe("00:00");
    expect(formatSleepRemaining(60 * 60_000)).toBe("1:00:00");
    expect(formatSleepRemaining(61 * 60_000 + 1_000)).toBe("1:01:01");
  });

  it("derives the deadline from the clock instead of storing one", () => {
    const now = 1_700_000_000_000;
    expect(sleepDeadline(30, now)).toBe(now + 30 * 60_000);
    expect(sleepDeadline(0, now)).toBe(now);
    expect(sleepDeadline(-5, now)).toBe(now);
  });
});

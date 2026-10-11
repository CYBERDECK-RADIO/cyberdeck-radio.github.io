// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  IDLE_EVENTS,
  SCREENSAVER_IDLE_MS,
  SCREENSAVER_CONTROL_ATTR,
  WAKE_EVENTS,
  isScreensaverControl,
} from "./screensaver";

describe("screensaver contract", () => {
  it("arms after a minute of stillness", () => {
    expect(SCREENSAVER_IDLE_MS).toBe(60_000);
  });

  it("counts pointer drift as stillness but never as a wake-up", () => {
    expect(IDLE_EVENTS).toContain("pointermove");
    expect(WAKE_EVENTS).not.toContain("pointermove");
  });

  it("wakes on deliberate input only", () => {
    expect(WAKE_EVENTS).toEqual(["pointerdown", "keydown", "wheel", "touchstart"]);
    for (const event of WAKE_EVENTS) expect(IDLE_EVENTS).toContain(event);
  });

  it("recognises controls that live inside the saver", () => {
    const control = document.createElement("button");
    control.setAttribute(SCREENSAVER_CONTROL_ATTR, "");
    const inner = document.createElement("span");
    control.append(inner);

    expect(isScreensaverControl(inner)).toBe(true);
    expect(isScreensaverControl(control)).toBe(true);
    expect(isScreensaverControl(document.createElement("div"))).toBe(false);
    expect(isScreensaverControl(null)).toBe(false);
  });
});

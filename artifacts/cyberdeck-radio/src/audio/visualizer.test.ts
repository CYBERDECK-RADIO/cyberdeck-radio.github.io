import { describe, expect, it } from "vitest";

import {
  createSimulatedSpectrum,
  resolveVisualizerMode,
} from "./visualizer";

describe("createSimulatedSpectrum", () => {
  it("produces one level per bar", () => {
    const spectrum = createSimulatedSpectrum(24);

    expect(spectrum()).toHaveLength(24);
  });

  it("keeps every level inside the 0..1 range", () => {
    const spectrum = createSimulatedSpectrum(24);

    for (let frame = 0; frame < 60; frame += 1) {
      for (const level of spectrum()) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is deterministic for the same seed", () => {
    const first = createSimulatedSpectrum(24, 7);
    const second = createSimulatedSpectrum(24, 7);

    expect(first()).toEqual(second());
  });

  it("varies between seeds", () => {
    const first = createSimulatedSpectrum(24, 1);
    const second = createSimulatedSpectrum(24, 2);

    expect(first()).not.toEqual(second());
  });

  it("animates smoothly between consecutive frames", () => {
    const spectrum = createSimulatedSpectrum(24, 3);
    const previous = spectrum();

    for (let frame = 0; frame < 30; frame += 1) {
      const current = spectrum();
      for (let bar = 0; bar < current.length; bar += 1) {
        expect(Math.abs(current[bar] - previous[bar])).toBeLessThan(0.5);
      }
      previous.splice(0, previous.length, ...current);
    }
  });
});

describe("resolveVisualizerMode", () => {
  it("defaults to simulated when no analyser is connected", () => {
    expect(resolveVisualizerMode(false)).toBe("simulated");
  });

  it("reports analyser only when an analyser is actually connected", () => {
    expect(resolveVisualizerMode(true)).toBe("analyser");
  });
});
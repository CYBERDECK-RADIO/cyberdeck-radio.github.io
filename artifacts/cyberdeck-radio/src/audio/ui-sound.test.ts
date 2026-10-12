// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SoundProfile } from "@/preferences/themes";

import { createUiSound } from "./ui-sound";

type GlobalWithAudio = typeof globalThis & {
  AudioContext?: unknown;
  webkitAudioContext?: unknown;
};

const globals = globalThis as GlobalWithAudio;
const originalAudioContext = globals.AudioContext;
const originalWebkitAudioContext = globals.webkitAudioContext;

const profile: SoundProfile = { cue: "blip", pitch: 880, decay: 0.07, gain: 0.5 };

beforeEach(() => {
  globals.AudioContext = undefined;
  globals.webkitAudioContext = undefined;
});

afterEach(() => {
  globals.AudioContext = originalAudioContext;
  globals.webkitAudioContext = originalWebkitAudioContext;
});

describe("without Web Audio", () => {
  it("is a silent no-op", () => {
    const sound = createUiSound();

    expect(() => sound.play("select", profile)).not.toThrow();
    expect(() => sound.play("theme", profile)).not.toThrow();
  });

  it("dispose is idempotent", () => {
    const sound = createUiSound();

    sound.dispose();
    expect(() => sound.dispose()).not.toThrow();
    expect(() => sound.play("select", profile)).not.toThrow();
  });
});

describe("with a minimal Web Audio shim", () => {
  function installFakeAudioContext(): Record<string, number> {
    const counts = { gain: 0, oscillator: 0, filter: 0, buffer: 0, bufferSource: 0, resume: 0, close: 0 };

    const node = () => ({ connect: () => {}, disconnect: () => {} });
    const param = () => {
      const fake = {
        value: 0,
        setValueAtTime: (value: number) => {
          fake.value = value;
        },
        exponentialRampToValueAtTime: (value: number) => {
          fake.value = value;
        },
      };
      return fake;
    };

    const context = {
      currentTime: 0,
      state: "suspended",
      sampleRate: 44100,
      destination: node(),
      createGain: () => {
        counts.gain += 1;
        return { ...node(), gain: param() };
      },
      createOscillator: () => {
        counts.oscillator += 1;
        return { ...node(), type: "sine", frequency: param(), start: () => {}, stop: () => {} };
      },
      createBiquadFilter: () => {
        counts.filter += 1;
        return { ...node(), type: "lowpass", frequency: param(), Q: param() };
      },
      createBufferSource: () => {
        counts.bufferSource += 1;
        return { ...node(), buffer: null, start: () => {}, stop: () => {} };
      },
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        counts.buffer += 1;
        return { length, numberOfChannels: channels, sampleRate, getChannelData: () => new Float32Array(length) };
      },
      resume: () => {
        counts.resume += 1;
        return Promise.resolve();
      },
      close: () => {
        counts.close += 1;
        return Promise.resolve();
      },
    };

    globals.AudioContext = function FakeAudioContext() {
      return context;
    };
    return counts;
  }

  it("voices a cue through the graph and cleans up on dispose", () => {
    const counts = installFakeAudioContext();
    const sound = createUiSound(0.8);

    sound.play("select", profile);
    expect(counts.gain).toBeGreaterThanOrEqual(2);
    expect(counts.oscillator).toBe(1);
    expect(counts.filter).toBe(1);
    expect(counts.resume).toBe(1);

    sound.play("tap", { cue: "woodblock", pitch: 1200, decay: 0.09, gain: 0.45 });
    expect(counts.bufferSource).toBe(1);
    expect(counts.buffer).toBeGreaterThanOrEqual(1);

    sound.dispose();
    expect(counts.close).toBe(1);
    expect(() => sound.dispose()).not.toThrow();
    expect(counts.close).toBe(1);
    sound.play("select", profile);
    expect(counts.oscillator).toBe(1);
  });
});

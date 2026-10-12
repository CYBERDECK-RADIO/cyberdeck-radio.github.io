/**
 * ui-sound — the interface voice of a theme, synthesized on a shared AudioContext.
 *
 *   play(cue, profile) ──▶ oscillator/noise + gain envelope ──▶ master ──▶ out
 *
 * There are no audio files. Each `SoundCueId` is a tiny WebAudio recipe — a
 * tight blip, a pitch-bent cartoon boing, a struck woodblock, a resonant gong,
 * or a membrane thump — tuned by the active theme's `SoundProfile`. The context
 * is created lazily on the first `play()`, which always follows a user gesture,
 * so browsers never block it. When Web Audio is unavailable (SSR, jsdom) the
 * engine is a silent no-op and never throws, keeping the interaction it
 * decorates intact.
 */

import type { SoundProfile } from "@/preferences/themes";

/** The interaction being voiced; each shape scales the theme profile. */
export type UiCue = "select" | "tap" | "wake" | "theme";

export interface UiSound {
  /** Voice one interaction with the active theme's profile. */
  play(cue: UiCue, profile: SoundProfile): void;
  /** Close the context and drop every node. Safe to call more than once. */
  dispose(): void;
}

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const ctor =
    (globalThis as { AudioContext?: AudioContextCtor }).AudioContext ??
    (globalThis as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return ctor ?? null;
}

/** Per-cue envelope shaping laid over the theme's profile. */
const CUE_SHAPE: Record<UiCue, { gain: number; pitch: number; decay: number }> = {
  select: { gain: 1, pitch: 1, decay: 1 },
  tap: { gain: 0.55, pitch: 1.25, decay: 0.6 },
  wake: { gain: 1.25, pitch: 0.75, decay: 1.6 },
  theme: { gain: 1, pitch: 1, decay: 1.4 },
};

/** An exponential envelope that can never be asked for exact zero. */
const SILENCE = 0.0001;

export function createUiSound(masterVolume = 0.5): UiSound {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let disposed = false;

  function ensureContext(): AudioContext | null {
    if (disposed) return null;
    if (context) return context;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      context = new Ctor();
      master = context.createGain();
      master.gain.value = masterVolume;
      master.connect(context.destination);
    } catch {
      context = null;
      master = null;
    }
    return context;
  }

  /** One shared white-noise buffer for the struck timbres. */
  function noise(ctx: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer;
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.2));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    noiseBuffer = buffer;
    return buffer;
  }

  function envelope(node: AudioNode, peak: number, decay: number, attack = 0.004): void {
    const ctx = context!;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const level = Math.max(peak, SILENCE);
    gain.gain.setValueAtTime(SILENCE, now);
    gain.gain.exponentialRampToValueAtTime(level, now + attack);
    gain.gain.exponentialRampToValueAtTime(SILENCE, now + attack + Math.max(decay, 0.02));
    node.connect(gain);
    gain.connect(master!);
  }

  function voice(profile: SoundProfile, shape: (typeof CUE_SHAPE)[UiCue]): void {
    const ctx = context!;
    const now = ctx.currentTime;
    const peak = profile.gain * shape.gain;
    const decay = Math.max(0.03, profile.decay * shape.decay);
    const freq = profile.pitch * shape.pitch;

    switch (profile.cue) {
      case "blip": {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, now);
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(Math.min(freq * 3, 6000), now);
        osc.connect(filter);
        envelope(filter, peak, decay);
        osc.start(now);
        osc.stop(now + decay + 0.05);
        break;
      }
      case "boing": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq * 1.6, now);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.9, now + decay * 0.35);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.75, now + decay);
        envelope(osc, peak, decay);
        osc.start(now);
        osc.stop(now + decay + 0.05);
        break;
      }
      case "woodblock": {
        const src = ctx.createBufferSource();
        src.buffer = noise(ctx);
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.setValueAtTime(freq, now);
        band.Q.setValueAtTime(9, now);
        src.connect(band);
        envelope(band, peak, decay);
        src.start(now);
        src.stop(now + decay + 0.05);
        break;
      }
      case "gong": {
        // A fundamental plus two inharmonic partials, left to ring.
        const partials = [
          [1, 1],
          [1.51, 0.5],
          [2.02, 0.28],
        ] as const;
        for (const [ratio, level] of partials) {
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq * ratio, now);
          envelope(osc, peak * level, decay, 0.02);
          osc.start(now);
          osc.stop(now + decay + 0.1);
        }
        break;
      }
      case "membrane": {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq * 1.8, now);
        osc.frequency.exponentialRampToValueAtTime(freq, now + decay * 0.5);
        envelope(osc, peak, decay);
        osc.start(now);
        osc.stop(now + decay + 0.05);
        break;
      }
    }
  }

  return {
    play(cue, profile) {
      const ctx = ensureContext();
      if (!ctx || !master) return;
      try {
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        voice(profile, CUE_SHAPE[cue]);
      } catch {
        // A cue must never break the interaction it decorates.
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        master?.disconnect();
      } catch {
        // Already-detached nodes are fine to ignore.
      }
      try {
        void context?.close();
      } catch {
        // A closed context is fine to ignore.
      }
      context = null;
      master = null;
      noiseBuffer = null;
    },
  };
}

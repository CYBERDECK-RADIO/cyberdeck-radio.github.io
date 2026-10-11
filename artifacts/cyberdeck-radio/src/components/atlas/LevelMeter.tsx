/**
 * Live level meter: eight hairlines that follow the tuned signal.
 *
 *   analyser ──▶ createAnalyserSpectrum ──▶ hairline heights (rAF)
 *   no safe analyser ──▶ simulated crawl, labeled SIMULATED
 *   document hidden ──▶ frames pause and resume on return
 *
 * Honest about its source: `onSignal` fires the first frame with real audio
 * levels so the dossier can flip its badge from SIMULATED to ANALYSER.
 */

import { useCallback, useEffect, useRef } from "react";
import type { AnalyserLike } from "@/audio/audio-controller";
import {
  analyserHasSignal,
  createAnalyserSpectrum,
  createSimulatedSpectrum,
} from "@/audio/visualizer";

export const LEVEL_HAIRLINES = 8;

type LevelMeterProps = {
  analyser?: AnalyserLike | null;
  active?: boolean;
  stationId?: string | null;
  onSignal?: () => void;
};

export default function LevelMeter({
  analyser = null,
  active = false,
  stationId = null,
  onSignal,
}: LevelMeterProps) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const signalRef = useRef(false);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  useEffect(() => {
    signalRef.current = false;
  }, [stationId, analyser]);

  useEffect(() => {
    const simulated = createSimulatedSpectrum(LEVEL_HAIRLINES, 7);
    const analyserSource = analyser ? createAnalyserSpectrum(analyser, LEVEL_HAIRLINES) : null;
    let levels = new Array<number>(LEVEL_HAIRLINES).fill(0.08);
    let frame = 0;
    let running = true;

    const scheduleFrame = () => {
      if (!running) return;
      if (typeof document !== "undefined" && document.hidden) {
        frame = 0;
        return;
      }
      frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(draw) : 0;
    };

    const draw = () => {
      if (!running) return;
      if (!active) {
        levels = levels.map((level) => level * 0.86 + 0.02);
      } else if (analyserSource) {
        const candidate = analyserSource();
        if (analyserHasSignal(candidate)) {
          if (!signalRef.current) {
            signalRef.current = true;
            onSignalRef.current?.();
          }
          levels = candidate;
        } else if (signalRef.current) {
          levels = candidate;
        } else {
          levels = simulated();
        }
      } else {
        levels = simulated();
      }
      for (let index = 0; index < barsRef.current.length; index += 1) {
        const bar = barsRef.current[index];
        if (bar) bar.style.transform = `scaleY(${Math.max(0.06, levels[index] ?? 0.08).toFixed(3)})`;
      }
      scheduleFrame();
    };

    const onVisibilityChange = () => {
      if (running && !document.hidden && frame === 0) scheduleFrame();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    scheduleFrame();
    if (typeof requestAnimationFrame !== "function") draw();

    return () => {
      running = false;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    };
  }, [active, analyser, stationId]);

  const assignBar = useCallback(
    (index: number) => (node: HTMLSpanElement | null) => {
      barsRef.current[index] = node;
    },
    [],
  );

  return (
    <div className="level-meter" data-testid="level-meter" aria-hidden="true">
      {Array.from({ length: LEVEL_HAIRLINES }, (_, index) => (
        <span key={index} className="level-meter__hairline" ref={assignBar(index)} />
      ))}
    </div>
  );
}

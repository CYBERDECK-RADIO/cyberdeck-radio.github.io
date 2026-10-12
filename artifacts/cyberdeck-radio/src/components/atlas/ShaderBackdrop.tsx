/**
 * ShaderBackdrop — a living mesh-gradient sky under the atlas.
 *
 *   theme tokens (--bg, --accent…) ──▶ palette ──▶ MeshGradient uniforms
 *   prefers-reduced-motion ──▶ speed 0 (one frozen frame, no rAF cost)
 *   no WebGL2 ──▶ render nothing; the CSS dotted-grid background remains
 *
 * Paper Shaders mounts a single fullscreen canvas behind the SVG world
 * (DOM order keeps the map, dossier, and dock above it). The canvas is
 * capped in pixel count and pixel ratio so a 4K retina screen cannot
 * out-render the GPU budget, and the mount pauses itself whenever the
 * tab is hidden or the element leaves the viewport.
 */
import { useEffect, useMemo, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { getThemeDefinition, type ShaderProfile, type ThemeId } from "@/preferences/themes";

/** Backdrop opacity while the atlas is awake, in zen, and while dimmed. */
export const BACKDROP_OPACITY = 0.5;

/** Hard fallbacks mirroring :root tokens, for environments without CSS vars. */
const FALLBACK_COLORS = {
  bg: "#0b0d11",
  bgSubtle: "#12161f",
  card: "#141822",
  accent: "#d4984f",
};

/** True when this browser can mount Paper Shaders (it requires WebGL2). */
export function supportsWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

/** Token key → CSS custom-property name, e.g. bgSubtle → --bg-subtle. */
const CSS_VAR_NAMES: Record<keyof typeof FALLBACK_COLORS, string> = {
  bg: "--bg",
  bgSubtle: "--bg-subtle",
  card: "--card",
  accent: "--accent",
};

function readCssColor(name: keyof typeof FALLBACK_COLORS): string {
  if (typeof getComputedStyle !== "function") return FALLBACK_COLORS[name];
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(CSS_VAR_NAMES[name])
    .trim();
  return value || FALLBACK_COLORS[name];
}

/**
 * The shader palette, pulled live from the CSS custom-property theme so the
 * GPU layer themes in lockstep with the DOM: deep space base, a slightly
 * lifted midtone, and two amber glows echoing the accent set.
 */
export function buildBackdropPalette(): string[] {
  const bg = readCssColor("bg");
  const bgSubtle = readCssColor("bgSubtle");
  const card = readCssColor("card");
  const accent = readCssColor("accent");
  return [bg, bgSubtle, card, accent];
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function SilentFallback() {
  return null;
}

/** The amber default's temperament, used before a theme id is supplied. */
const DEFAULT_SHADER: ShaderProfile = {
  distortion: 0.75,
  swirl: 0.35,
  speed: 0.15,
  grain: 0.06,
};

export default function ShaderBackdrop({ theme }: { theme?: ThemeId }) {
  const reducedMotion = usePrefersReducedMotion();
  const webgl2 = useMemo(() => supportsWebGL2(), []);
  // `theme` is only a change signal: when the active token block swaps, the
  // memo re-reads the CSS custom properties so the GPU sky re-themes too.
  const colors = useMemo(
    () => (webgl2 ? buildBackdropPalette() : []),
    [webgl2, theme],
  );
  const shader = theme ? getThemeDefinition(theme).shader : DEFAULT_SHADER;

  if (!webgl2) return null;

  return (
    <div
      className="atlas-canvas__backdrop"
      aria-hidden="true"
      data-testid="shader-backdrop"
    >
      {/* A shader crash must never take the atlas down with it. */}
      <ErrorBoundary FallbackComponent={SilentFallback}>
        <MeshGradient
          colors={colors}
          distortion={shader.distortion}
          swirl={shader.swirl}
          grainOverlay={shader.grain}
          speed={reducedMotion ? 0 : shader.speed}
          fit="cover"
          width="100%"
          height="100%"
          minPixelRatio={1}
          maxPixelCount={1_100_000}
        />
      </ErrorBoundary>
    </div>
  );
}

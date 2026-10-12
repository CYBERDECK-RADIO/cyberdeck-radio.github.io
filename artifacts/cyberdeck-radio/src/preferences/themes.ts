/**
 * The theme registry: the one place the runtime skin system is defined.
 *
 *   ThemeId ──▶ ThemeDefinition[] (label, blurb, family, pip, art, shader, swatch)
 *   applyThemeToDocument(id) ──▶ <html data-theme="…"> ──▶ CSS token block
 *
 * A skin is more than a palette. Beyond the `[data-theme]` colour block in
 * `index.css`, each row names the renderers and the audio layer read from here:
 *
 *   swatch ──▶ the ground/surface/accent chip the picker paints
 *   pip    ──▶ which inline-SVG station glyph `PipShape` draws
 *   art    ──▶ which inline-SVG backdrop `BackdropArt` tiles behind the world
 *   shader ──▶ the MeshGradient uniforms so the GPU sky matches the mood
 *   sound  ──▶ the interface-cue voice `audio/ui-sound.ts` synthesizes
 *
 * The structural side of a skin — its type, geometry, motion, and material
 * tokens (`--font-display`, `--panel-radius`, `--dur-base`, `--grain`, …) —
 * lives entirely in `index.css`'s `[data-theme]` blocks, so presentation never
 * drifts from the registry. This module carries only the catalog the UI
 * iterates over plus the tiny DOM write that swaps the active block. Parsing is total: an unknown id always
 * falls back to the default rather than throwing, matching the total-parse
 * store pattern used across the app.
 */

export type ThemeId =
  | "signal"
  | "water"
  | "air"
  | "fire"
  | "earth"
  | "bubblegum"
  | "comic"
  | "sakura"
  | "matsuri"
  | "lantern"
  | "jade"
  | "rajasthan"
  | "kerala"
  | "punjab"
  | "tamil";

/** The grouping the picker renders as section headers. */
export type ThemeFamily =
  | "signal"
  | "elemental"
  | "cartoon"
  | "japan"
  | "china"
  | "india";

/** Inline SVG station-pin shapes (see `theme/PipShape.tsx`). */
export type PipShapeId =
  | "dot"
  | "droplet"
  | "ring"
  | "spark"
  | "block"
  | "blob"
  | "star"
  | "petal"
  | "lanternPip"
  | "coin"
  | "arch"
  | "leaf"
  | "flower"
  | "kolam";

/** Inline SVG tiling backdrops (see `theme/BackdropArt.tsx`). */
export type BackdropArtId =
  | "grid"
  | "ripples"
  | "wind"
  | "embers"
  | "contours"
  | "bubbles"
  | "halftone"
  | "seigaiha"
  | "sakura"
  | "lanterns"
  | "mandala"
  | "phulkari"
  | "kolam";

/** MeshGradient tuning so each theme's GPU sky has its own temperament. */
export type ShaderProfile = {
  distortion: number;
  swirl: number;
  speed: number;
  grain: number;
};

/**
 * The voice a skin's interface speaks in. One cue id per timbre family — a
 * tight blip, a pitch-bent cartoon boing, a struck woodblock, a resonant gong,
 * or a membrane thump — tuned by pitch/decay/gain. `audio/ui-sound.ts` turns
 * these numbers into a WebAudio recipe; no audio files ship with the app.
 */
export type SoundCueId = "blip" | "boing" | "woodblock" | "gong" | "membrane";

export type SoundProfile = {
  cue: SoundCueId;
  /** Fundamental frequency in Hz. */
  pitch: number;
  /** Envelope decay in seconds. */
  decay: number;
  /** Relative loudness before the master cue gain (0..1). */
  gain: number;
};

/** Human-readable section titles, keyed by family. */
export const FAMILY_LABELS: Record<ThemeFamily, string> = {
  signal: "Signature",
  elemental: "Elements",
  cartoon: "Cartoon",
  japan: "Japan",
  china: "China",
  india: "India",
};

/** The attribute the CSS token blocks hang off of. */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * `swatch` is a three-colour preview (ground, surface, accent) the picker paints
 * as a chip so the menu reads even before the theme is applied.
 */
export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  blurb: string;
  family: ThemeFamily;
  pip: PipShapeId;
  art: BackdropArtId;
  shader: ShaderProfile;
  sound: SoundProfile;
  swatch: [string, string, string];
};

/** A registry row before its sound profile is joined in (`THEME_SOUNDS`). */
type ThemeSeed = Omit<ThemeDefinition, "sound">;

export const THEMES: readonly ThemeSeed[] = [
  {
    id: "signal",
    label: "Signal",
    blurb: "Amber pips on a dotted night",
    family: "signal",
    pip: "dot",
    art: "grid",
    shader: { distortion: 0.75, swirl: 0.35, speed: 0.15, grain: 0.06 },
    swatch: ["#0b0d11", "#141822", "#d4984f"],
  },
  {
    id: "water",
    label: "Water",
    blurb: "Droplets rippling through deep current",
    family: "elemental",
    pip: "droplet",
    art: "ripples",
    shader: { distortion: 0.95, swirl: 0.6, speed: 0.12, grain: 0.05 },
    swatch: ["#04121c", "#0a2434", "#46c1e8"],
  },
  {
    id: "air",
    label: "Air",
    blurb: "Drifting rings across open sky",
    family: "elemental",
    pip: "ring",
    art: "wind",
    shader: { distortion: 0.45, swirl: 0.25, speed: 0.25, grain: 0.03 },
    swatch: ["#eef3f8", "#ffffff", "#2f7fd1"],
  },
  {
    id: "fire",
    label: "Fire",
    blurb: "Sparks climbing off molten black",
    family: "elemental",
    pip: "spark",
    art: "embers",
    shader: { distortion: 1.1, swirl: 0.4, speed: 0.3, grain: 0.08 },
    swatch: ["#140a06", "#241410", "#ff6a2b"],
  },
  {
    id: "earth",
    label: "Earth",
    blurb: "Stony blocks on mossy terrain",
    family: "elemental",
    pip: "block",
    art: "contours",
    shader: { distortion: 0.4, swirl: 0.1, speed: 0.05, grain: 0.05 },
    swatch: ["#0e120c", "#1a2116", "#7fae5a"],
  },
  {
    id: "bubblegum",
    label: "Bubblegum",
    blurb: "Glossy toons and popping candy",
    family: "cartoon",
    pip: "blob",
    art: "bubbles",
    shader: { distortion: 0.6, swirl: 0.5, speed: 0.2, grain: 0.02 },
    swatch: ["#fff0f7", "#ffffff", "#ff4fa3"],
  },
  {
    id: "comic",
    label: "Comic",
    blurb: "Halftone dots and thick ink lines",
    family: "cartoon",
    pip: "star",
    art: "halftone",
    shader: { distortion: 0.3, swirl: 0.15, speed: 0.1, grain: 0.12 },
    swatch: ["#fdf7e6", "#ffffff", "#e63946"],
  },
  {
    id: "sakura",
    label: "Sakura",
    blurb: "Petals falling on indigo dusk",
    family: "japan",
    pip: "petal",
    art: "sakura",
    shader: { distortion: 0.7, swirl: 0.45, speed: 0.14, grain: 0.04 },
    swatch: ["#140d18", "#261831", "#f7a8c8"],
  },
  {
    id: "matsuri",
    label: "Matsuri",
    blurb: "Festival lanterns and warm vermilion",
    family: "japan",
    pip: "lanternPip",
    art: "lanterns",
    shader: { distortion: 0.85, swirl: 0.5, speed: 0.2, grain: 0.06 },
    swatch: ["#1a0a0b", "#2e1516", "#ff5a5f"],
  },
  {
    id: "lantern",
    label: "Lantern",
    blurb: "Seal red and gold on lacquer black",
    family: "china",
    pip: "lanternPip",
    art: "lanterns",
    shader: { distortion: 0.9, swirl: 0.55, speed: 0.18, grain: 0.07 },
    swatch: ["#160808", "#2a1010", "#f0453f"],
  },
  {
    id: "jade",
    label: "Jade",
    blurb: "Jade coins over cloud-scroll waves",
    family: "china",
    pip: "coin",
    art: "seigaiha",
    shader: { distortion: 0.6, swirl: 0.4, speed: 0.1, grain: 0.05 },
    swatch: ["#06130f", "#0e2620", "#3fbf9f"],
  },
  {
    id: "rajasthan",
    label: "Rajasthan",
    blurb: "Royal pink, gold, and mandala arches",
    family: "india",
    pip: "arch",
    art: "mandala",
    shader: { distortion: 0.8, swirl: 0.5, speed: 0.16, grain: 0.05 },
    swatch: ["#180a12", "#2c1222", "#ff5fa2"],
  },
  {
    id: "kerala",
    label: "Kerala",
    blurb: "Backwater green and temple gold",
    family: "india",
    pip: "leaf",
    art: "seigaiha",
    shader: { distortion: 0.7, swirl: 0.45, speed: 0.12, grain: 0.05 },
    swatch: ["#07130d", "#0f281b", "#4fbf7a"],
  },
  {
    id: "punjab",
    label: "Punjab",
    blurb: "Phulkari diamonds in bold thread",
    family: "india",
    pip: "flower",
    art: "phulkari",
    shader: { distortion: 0.85, swirl: 0.5, speed: 0.2, grain: 0.05 },
    swatch: ["#120e1e", "#221a3e", "#ff8a3d"],
  },
  {
    id: "tamil",
    label: "Tamil",
    blurb: "Kolam grids and vermilion stone",
    family: "india",
    pip: "kolam",
    art: "kolam",
    shader: { distortion: 0.75, swirl: 0.45, speed: 0.14, grain: 0.06 },
    swatch: ["#0a1414", "#142726", "#ff6b3d"],
  },
];

export const DEFAULT_THEME_ID: ThemeId = "signal";

/**
 * Each skin's interface voice, keyed by theme id. Kept beside the registry (not
 * inline) so the audio layer reads as one coherent table and a missing entry
 * fails a totality check rather than silently muting a theme.
 */
export const THEME_SOUNDS: Record<ThemeId, SoundProfile> = {
  signal: { cue: "blip", pitch: 880, decay: 0.07, gain: 0.5 },
  water: { cue: "blip", pitch: 620, decay: 0.13, gain: 0.5 },
  air: { cue: "blip", pitch: 1046, decay: 0.1, gain: 0.45 },
  fire: { cue: "blip", pitch: 500, decay: 0.06, gain: 0.55 },
  earth: { cue: "blip", pitch: 320, decay: 0.16, gain: 0.55 },
  bubblegum: { cue: "boing", pitch: 660, decay: 0.24, gain: 0.5 },
  comic: { cue: "boing", pitch: 540, decay: 0.14, gain: 0.5 },
  sakura: { cue: "woodblock", pitch: 1200, decay: 0.09, gain: 0.45 },
  matsuri: { cue: "woodblock", pitch: 900, decay: 0.11, gain: 0.5 },
  lantern: { cue: "gong", pitch: 440, decay: 0.55, gain: 0.4 },
  jade: { cue: "gong", pitch: 620, decay: 0.42, gain: 0.4 },
  rajasthan: { cue: "membrane", pitch: 300, decay: 0.22, gain: 0.55 },
  kerala: { cue: "membrane", pitch: 360, decay: 0.2, gain: 0.55 },
  punjab: { cue: "membrane", pitch: 420, decay: 0.15, gain: 0.55 },
  tamil: { cue: "membrane", pitch: 480, decay: 0.17, gain: 0.55 },
};

const THEME_IDS = new Set<string>(THEMES.map((theme) => theme.id));

/** True only for a known theme id — total over any unknown input. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}

/** Fall back to the default definition rather than ever returning undefined. */
export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  const seed = THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
  return { ...seed, sound: THEME_SOUNDS[seed.id] };
}

/** The next theme in registry order, wrapping — for a keyboard/cycle affordance. */
export function nextThemeId(id: ThemeId): ThemeId {
  const index = THEMES.findIndex((theme) => theme.id === id);
  const next = index === -1 ? 0 : (index + 1) % THEMES.length;
  return THEMES[next]!.id;
}

/**
 * Swap the active token block by writing the attribute onto `<html>`. The
 * attribute is global, so it survives route changes (e.g. the 404 page) and is
 * what lets `ShaderBackdrop` and the CSS `:root` defaults stay in lockstep.
 */
export function applyThemeToDocument(id: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, id);
}

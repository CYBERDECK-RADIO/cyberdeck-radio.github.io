/**
 * BackdropArt — the inline-SVG decorative layer that tiles behind the world.
 *
 *   art ──▶ <svg> with one <pattern> tile of procedural motifs
 *
 * Sits above the WebGL sky and below the cartography, painting the theme's
 * cultural/textural identity: seigaiha waves, sakura petals, lantern strings,
 * kolam dots, phulkari diamonds, mandalas, halftone, embers, ripples. Colour is
 * `currentColor` (set to the accent token by `.motif-art`), so a palette swap
 * repaints the art for free. Tiles are generated with deterministic positions —
 * no randomness — so the layer is stable across renders and snapshots.
 */

import type { ReactNode } from "react";

import type { BackdropArtId } from "@/preferences/themes";

/** Deterministic pseudo-random fractions for scattering motifs in a tile. */
const FRACTIONS = [
  0.11, 0.63, 0.37, 0.84, 0.49, 0.22, 0.73, 0.44, 0.92, 0.06, 0.58, 0.28,
];

function frac(index: number): number {
  return FRACTIONS[index % FRACTIONS.length]!;
}

/** A single 5-petal blossom, centred at (x, y). */
function blossom(x: number, y: number, scale: number, key: string) {
  return (
    <g key={key} transform={`translate(${x} ${y}) scale(${scale})`}>
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse
          key={angle}
          cx={0}
          cy={-4}
          rx={2.6}
          ry={4.2}
          transform={`rotate(${angle})`}
        />
      ))}
    </g>
  );
}

type Tile = { width: number; height: number; content: ReactNode };

/** The pattern tile for each art id; `null` means "leave the CSS grid alone". */
function buildTile(art: BackdropArtId): Tile | null {
  switch (art) {
    case "grid":
      return null;

    case "ripples":
      return {
        width: 120,
        height: 120,
        content: (
          <g fill="none" stroke="currentColor" strokeWidth={0.9}>
            {[16, 34, 52].map((r) => (
              <circle key={r} cx={0} cy={0} r={r} />
            ))}
            {[16, 34, 52].map((r) => (
              <circle key={`c${r}`} cx={120} cy={120} r={r} />
            ))}
            {[16, 34].map((r) => (
              <circle key={`d${r}`} cx={120} cy={0} r={r} />
            ))}
            {[16, 34].map((r) => (
              <circle key={`e${r}`} cx={0} cy={120} r={r} />
            ))}
          </g>
        ),
      };

    case "wind":
      return {
        width: 160,
        height: 90,
        content: (
          <g fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round">
            {[0, 30, 60].map((y, i) => (
              <path
                key={y}
                d={`M0,${y + 12} C40,${y - 8} 80,${y + 34} 160,${y + 14}`}
                opacity={0.5 + i * 0.18}
              />
            ))}
            <path d="M40,78 C70,66 100,86 140,74" opacity={0.35} />
          </g>
        ),
      };

    case "embers":
      return {
        width: 140,
        height: 160,
        content: (
          <g fill="currentColor">
            {Array.from({ length: 12 }, (_, i) => (
              <circle
                key={i}
                className="motif-ember"
                cx={frac(i) * 140}
                cy={frac(i + 5) * 160}
                r={0.7 + frac(i + 2) * 1.6}
                style={{ animationDelay: `${(frac(i + 3) * 4).toFixed(2)}s` }}
              />
            ))}
          </g>
        ),
      };

    case "contours":
      return {
        width: 160,
        height: 160,
        content: (
          <g fill="none" stroke="currentColor" strokeWidth={0.8}>
            {[22, 40, 58, 76].map((r, i) => (
              <ellipse key={r} cx={30} cy={110} rx={r} ry={r * 0.6} opacity={0.6 - i * 0.1} />
            ))}
            {[26, 46, 66].map((r, i) => (
              <ellipse key={`b${r}`} cx={130} cy={30} rx={r} ry={r * 0.7} opacity={0.5 - i * 0.1} />
            ))}
          </g>
        ),
      };

    case "bubbles":
      return {
        width: 120,
        height: 120,
        content: (
          <g fill="none" stroke="currentColor" strokeWidth={1.1}>
            {Array.from({ length: 9 }, (_, i) => (
              <circle
                key={i}
                cx={frac(i) * 120}
                cy={frac(i + 4) * 120}
                r={4 + frac(i + 1) * 9}
                opacity={0.35 + frac(i + 2) * 0.4}
              />
            ))}
          </g>
        ),
      };

    case "halftone":
      return {
        width: 26,
        height: 26,
        content: (
          <g fill="currentColor">
            <circle cx={6} cy={6} r={3.4} />
            <circle cx={19} cy={6} r={1.8} />
            <circle cx={6} cy={19} r={1.8} />
            <circle cx={19} cy={19} r={3.4} />
          </g>
        ),
      };

    case "seigaiha":
      return {
        width: 64,
        height: 32,
        content: (
          <g fill="none" stroke="currentColor" strokeWidth={1}>
            {[
              [0, 0],
              [64, 0],
              [32, 16],
              [0, 32],
              [64, 32],
            ].map(([cx, cy], i) => (
              <g key={i} transform={`translate(${cx} ${cy})`}>
                {[6, 12, 18].map((r) => (
                  <path key={r} d={`M${-r},0 A${r},${r} 0 0 1 ${r},0`} />
                ))}
              </g>
            ))}
          </g>
        ),
      };

    case "sakura":
      return {
        width: 150,
        height: 150,
        content: (
          <g fill="currentColor" stroke="none">
            {[0, 1, 2, 3].map((i) =>
              blossom(frac(i) * 150, frac(i + 6) * 150, 0.9 + frac(i + 2) * 0.6, `bloom-${i}`),
            )}
            {Array.from({ length: 8 }, (_, i) => (
              <ellipse
                key={`p${i}`}
                cx={frac(i + 3) * 150}
                cy={frac(i + 8) * 150}
                rx={1.4}
                ry={2.6}
                transform={`rotate(${frac(i) * 360} ${frac(i + 3) * 150} ${frac(i + 8) * 150})`}
                opacity={0.7}
              />
            ))}
          </g>
        ),
      };

    case "lanterns":
      return {
        width: 96,
        height: 120,
        content: (
          <g fill="none" stroke="currentColor" strokeWidth={1.2}>
            {[
              [24, 36],
              [72, 60],
              [48, 96],
            ].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <line x1={0} y1={-16} x2={0} y2={-11} />
                <ellipse cx={0} cy={0} rx={9} ry={11} fill="currentColor" fillOpacity={0.18} />
                <line x1={-6} y1={0} x2={6} y2={0} opacity={0.7} />
                <line x1={0} y1={11} x2={0} y2={16} />
              </g>
            ))}
          </g>
        ),
      };

    case "mandala":
      return {
        width: 170,
        height: 170,
        content: (
          <g fill="none" stroke="currentColor" strokeWidth={1} transform="translate(85 85)">
            {[20, 34, 48].map((r) => (
              <circle key={r} r={r} />
            ))}
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d="M0,-20 Q7,-34 0,-48 Q-7,-34 0,-20"
                transform={`rotate(${i * 30})`}
              />
            ))}
            {Array.from({ length: 8 }, (_, i) => (
              <circle key={`d${i}`} cx={0} cy={-34} r={2} transform={`rotate(${i * 45})`} />
            ))}
          </g>
        ),
      };

    case "phulkari":
      return {
        width: 44,
        height: 44,
        content: (
          <g stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
            <path d="M22,6 L38,22 L22,38 L6,22 Z" fill="none" />
            <path d="M12,12 L32,32 M32,12 L12,32" />
            <circle cx={22} cy={22} r={2.4} fill="currentColor" stroke="none" />
          </g>
        ),
      };

    case "kolam":
      return {
        width: 60,
        height: 60,
        content: (
          <g stroke="currentColor" strokeWidth={1} fill="none">
            <path d="M8,30 Q30,8 52,30 Q30,52 8,30 Z" />
            <path d="M30,8 Q52,30 30,52 Q8,30 30,8 Z" opacity={0.6} />
            {[
              [8, 30],
              [30, 8],
              [52, 30],
              [30, 52],
              [30, 30],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={1.7} fill="currentColor" stroke="none" />
            ))}
          </g>
        ),
      };

    default:
      return null;
  }
}

export default function BackdropArt({ art }: { art: BackdropArtId }) {
  const tile = buildTile(art);
  if (!tile) return null;
  const patternId = `motif-${art}`;

  return (
    <svg
      className={`motif-art motif-art--${art}`}
      aria-hidden="true"
      data-testid="backdrop-art"
      data-art={art}
    >
      <defs>
        <pattern id={patternId} width={tile.width} height={tile.height} patternUnits="userSpaceOnUse">
          {tile.content}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

/**
 * PipShape — the inline-SVG station glyph, one drawing per `PipShapeId`.
 *
 *   shape ──▶ <g> of paths, authored around the origin at ~±6 units
 *
 * Every fill/stroke is `currentColor`, so the marker's health/selected/pinned
 * state is set once on the parent `.atlas-world__pip` (or the picker option) and
 * inherited here. The same component paints the tiny preview inside the theme
 * picker, scaled down by the surrounding `<svg viewBox>`.
 */

import type { PipShapeId } from "@/preferences/themes";

/** A 2n-point star (alternating outer/inner radii), points-up. */
function starPath(outer: number, inner: number, points = 5): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    coords.push(
      `${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `M${coords.join(" L")} Z`;
}

/** N petals, each an ellipse pushed outward and rotated around the centre. */
function petals(count: number, rx: number, ry: number, distance: number) {
  return Array.from({ length: count }, (_, i) => (
    <ellipse
      key={i}
      className="atlas-world__glyph"
      cx={0}
      cy={-distance}
      rx={rx}
      ry={ry}
      transform={`rotate(${(360 / count) * i})`}
    />
  ));
}

type PipShapeProps = { shape: PipShapeId };

export default function PipShape({ shape }: PipShapeProps) {
  return (
    <g className={`pip-shape pip-shape--${shape}`}>
      {shape === "dot" && <circle className="atlas-world__glyph atlas-world__dot" r={3.2} />}

      {shape === "droplet" && (
        <path
          className="atlas-world__glyph"
          d="M0,-5.4 C2.7,-1.7 4.2,0.5 4.2,2.3 A4.2,4.2 0 1 1 -4.2,2.3 C-4.2,0.5 -2.7,-1.7 0,-5.4 Z"
        />
      )}

      {shape === "ring" && (
        <>
          <circle className="atlas-world__glyph-line" r={3.6} strokeWidth={1.6} />
          <path className="atlas-world__glyph-line atlas-world__glyph--arc" d="M2.6,-2.6 A3.7,3.7 0 0 1 2.6,2.6" strokeWidth={1.2} />
        </>
      )}

      {shape === "spark" && (
        <path className="atlas-world__glyph" d={starPath(5.4, 1.35, 4)} />
      )}

      {shape === "block" && (
        <rect className="atlas-world__glyph" x={-3} y={-3} width={6} height={6} rx={0.8} />
      )}

      {shape === "blob" && (
        <>
          <path
            className="atlas-world__glyph"
            d="M0,-4.4 C2.6,-4.4 4.6,-2.4 4.6,0.2 C4.6,3 2.7,4.6 0.2,4.6 C-2.6,4.6 -4.6,2.7 -4.6,0.1 C-4.6,-2.5 -2.6,-4.4 0,-4.4 Z"
          />
          <circle className="atlas-world__glyph atlas-world__glyph--shine" cx={-1.4} cy={-1.6} r={1.15} />
        </>
      )}

      {shape === "star" && <path className="atlas-world__glyph" d={starPath(5.2, 2.3, 5)} />}

      {shape === "petal" && (
        <>
          {petals(5, 1.7, 2.7, 2.3)}
          <circle className="atlas-world__glyph atlas-world__glyph--core" r={1.1} />
        </>
      )}

      {shape === "lanternPip" && (
        <>
          <rect className="atlas-world__glyph" x={-2.4} y={-3.6} width={4.8} height={7.2} rx={2.4} />
          <line className="atlas-world__glyph-line" x1={-3} y1={-4.2} x2={3} y2={-4.2} strokeWidth={1} />
          <line className="atlas-world__glyph-line" x1={-1} y1={4.2} x2={1} y2={5.2} strokeWidth={1} />
        </>
      )}

      {shape === "coin" && (
        <path
          className="atlas-world__glyph"
          fillRule="evenodd"
          d="M0,-4.2 A4.2,4.2 0 1 0 0,4.2 A4.2,4.2 0 1 0 0,-4.2 Z M-1.5,-1.5 L1.5,-1.5 L1.5,1.5 L-1.5,1.5 Z"
        />
      )}

      {shape === "arch" && (
        <path className="atlas-world__glyph" d="M-4,4.2 L-4,-0.6 A4,4 0 0 1 4,-0.6 L4,4.2 Z" />
      )}

      {shape === "leaf" && (
        <>
          <path className="atlas-world__glyph" d="M0,5.4 C-4.2,2.4 -4.2,-3 0,-6 C4.2,-3 4.2,2.4 0,5.4 Z" />
          <line className="atlas-world__glyph-line atlas-world__glyph--vein" x1={0} y1={-4.4} x2={0} y2={4.4} strokeWidth={0.8} />
        </>
      )}

      {shape === "flower" && (
        <>
          {petals(6, 1.5, 2.4, 2.4)}
          <circle className="atlas-world__glyph atlas-world__glyph--core" r={1.2} />
        </>
      )}

      {shape === "kolam" && (
        <>
          <rect className="atlas-world__glyph-line" x={-3.4} y={-3.4} width={6.8} height={6.8} rx={0.6} strokeWidth={1} />
          <circle className="atlas-world__glyph" r={1.5} />
        </>
      )}
    </g>
  );
}

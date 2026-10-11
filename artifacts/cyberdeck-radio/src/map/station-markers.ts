/**
 * Atlas marker geometry: projection plus density clustering.
 *
 * The Radio Garden crawl pins every channel (38k+) to its city, so painting one
 * SVG pip per station would drown the map in nodes. Markers are derived from
 * the live view instead:
 *
 *   stations ──▶ project ──▶ cull to the padded viewport ──▶ grid buckets
 *   buckets  ──▶ single pip | glowing cluster (cell grows until under budget)
 *
 * The cell size is authored in screen pixels and converted to world units for
 * the current zoom, so marker density stays constant at every scale. The budget
 * loop only coarsens the grid when a busy region would otherwise exceed
 * `MARKER_BUDGET`, which keeps a 38k-channel catalog to a few hundred nodes.
 *
 * The locked station is never bucketed: it is always emitted as its own pip,
 * last in the list, so the selection can never be swallowed by a cluster.
 *
 * Deep dives read the same grid backwards: `findSeparationScale` answers the
 * zoom at which a cluster's channels stop sharing cells, which is what lets
 * the atlas fly apart a spread-out crowd and hand a co-located one to the
 * picker instead.
 */

import type Station from "../stations/types";

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

/** Marker ceiling per frame; past it the grid coarsens instead of drawing more. */
export const MARKER_BUDGET = 640;

/** Grid pitch in screen pixels before the budget loop touches it. */
const CELL_PX = 34;
const MAX_ATTEMPTS = 8;
const CELL_GROWTH = 1.45;

export type MapView = { x: number; y: number; scale: number };
export type MapPoint = { x: number; y: number };

export type StationMarker = {
  kind: "station";
  key: string;
  x: number;
  y: number;
  station: Station;
};

export type ClusterMarker = {
  kind: "cluster";
  key: string;
  x: number;
  y: number;
  count: number;
  stations: Station[];
};

export type AtlasMarker = StationMarker | ClusterMarker;

type VisibleStation = { station: Station; x: number; y: number };

type Bucket = {
  key: string;
  sumX: number;
  sumY: number;
  count: number;
  members: VisibleStation[];
};

export function project(longitude: number, latitude: number): MapPoint {
  return {
    x: ((longitude + 180) / 360) * MAP_WIDTH,
    y: ((90 - latitude) / 180) * MAP_HEIGHT,
  };
}

export function hasUsableCoordinates(
  coordinates: Station["coordinates"],
): coordinates is [number, number] {
  if (!coordinates) return false;
  const [longitude, latitude] = coordinates;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

export type BuildMarkersOptions = {
  /** Maximum markers to emit before coarsening the grid. */
  budget?: number;
  /** The locked station, always rendered as a standalone pip. */
  selectedId?: string | null;
};

export function buildStationMarkers(
  stations: readonly Station[],
  view: MapView,
  options: BuildMarkersOptions = {},
): AtlasMarker[] {
  const budget = options.budget ?? MARKER_BUDGET;
  const selectedId = options.selectedId ?? null;
  const scale = Number.isFinite(view.scale) && view.scale > 0 ? view.scale : 1;

  // World rect of the viewport, padded by half a screen on every side so a
  // pan has content waiting at the edges before the next rebuild lands.
  const viewportWidth = MAP_WIDTH / scale;
  const viewportHeight = MAP_HEIGHT / scale;
  const originX = -view.x / scale;
  const originY = -view.y / scale;
  const minX = originX - viewportWidth / 2;
  const maxX = originX + viewportWidth * 1.5;
  const minY = originY - viewportHeight / 2;
  const maxY = originY + viewportHeight * 1.5;

  const visible: VisibleStation[] = [];
  let locked: VisibleStation | null = null;

  for (const station of stations) {
    const coordinates = station.coordinates;
    if (!hasUsableCoordinates(coordinates)) continue;
    const point = project(coordinates[0], coordinates[1]);
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue;
    const entry = { station, x: point.x, y: point.y };
    if (selectedId && station.id === selectedId) locked = entry;
    else visible.push(entry);
  }

  let cell = CELL_PX / scale;
  let markers: AtlasMarker[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    markers = bucketMarkers(visible, cell);
    if (markers.length <= budget) break;
    cell *= CELL_GROWTH;
  }

  markers.sort(compareMarkers);
  if (locked) {
    markers.push({
      kind: "station",
      key: `locked:${locked.station.id}`,
      x: locked.x,
      y: locked.y,
      station: locked.station,
    });
  }
  return markers;
}

function bucketMarkers(visible: VisibleStation[], cell: number): AtlasMarker[] {
  const buckets = new Map<string, Bucket>();

  for (const entry of visible) {
    const gx = Math.floor(entry.x / cell);
    const gy = Math.floor(entry.y / cell);
    const key = `${gx}:${gy}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, sumX: 0, sumY: 0, count: 0, members: [] };
      buckets.set(key, bucket);
    }
    bucket.sumX += entry.x;
    bucket.sumY += entry.y;
    bucket.count += 1;
    bucket.members.push(entry);
  }

  const markers: AtlasMarker[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.count === 1) {
      const only = bucket.members[0];
      markers.push({
        kind: "station",
        key: `s:${only.station.id}`,
        x: only.x,
        y: only.y,
        station: only.station,
      });
      continue;
    }
    markers.push({
      kind: "cluster",
      key: `c:${bucket.key}`,
      x: bucket.sumX / bucket.count,
      y: bucket.sumY / bucket.count,
      count: bucket.count,
      stations: bucket.members.map((member) => member.station),
    });
  }
  return markers;
}

/** Clusters above pips (bubbles first, pins on top), locked station last. */
function compareMarkers(a: AtlasMarker, b: AtlasMarker): number {
  if (a.kind !== b.kind) return a.kind === "cluster" ? -1 : 1;
  if (a.kind === "cluster" && b.kind === "cluster" && a.count !== b.count) {
    return b.count - a.count;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Most represented country in a cluster — used for hover copy. */
export function dominantCountry(stations: readonly Station[]): string | null {
  const tally = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;

  for (const station of stations) {
    const country = station.country?.trim();
    if (!country) continue;
    const next = (tally.get(country) ?? 0) + 1;
    tally.set(country, next);
    if (next > bestCount) {
      bestCount = next;
      best = country;
    }
  }
  return best;
}

/**
 * Do these points stop sharing grid cells at this zoom? Two channels that sit
 * on the same pixel always cluster; one pixel of guaranteed clearance needs a
 * full cell of world-space distance (`CELL_PX / scale`).
 */
export function pointsSeparateAtScale(
  points: readonly MapPoint[],
  scale: number,
): boolean {
  if (points.length < 2) return true;
  if (!Number.isFinite(scale) || scale <= 0) return false;
  const cell = CELL_PX / scale;
  const seen = new Set<string>();
  for (const point of points) {
    const key = `${Math.floor(point.x / cell)}:${Math.floor(point.y / cell)}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * The smallest zoom inside [minScale, maxScale] where every point lands in its
 * own cell — or null when even maxScale leaves them stacked (co-located city
 * channels, which no amount of zooming can pull apart). Bucket membership also
 * shifts with grid phase, so the answer is found by bisection rather than a
 * closed form; callers that need certainty re-check against a real rebuild.
 */
export function findSeparationScale(
  points: readonly MapPoint[],
  minScale: number,
  maxScale: number,
): number | null {
  if (points.length < 2) return null;
  if (!(maxScale > minScale) || !Number.isFinite(minScale)) return null;
  if (!pointsSeparateAtScale(points, maxScale)) return null;
  if (pointsSeparateAtScale(points, minScale)) return minScale;

  let low = minScale;
  let high = maxScale;
  for (let attempt = 0; attempt < 24 && high - low > 0.005; attempt += 1) {
    const mid = (low + high) / 2;
    if (pointsSeparateAtScale(points, mid)) high = mid;
    else low = mid;
  }
  return high;
}

/** Radius of a cluster bubble in screen pixels (log-scaled, capped). */
export function clusterRadius(count: number): number {
  if (count <= 1) return 9;
  return Math.min(26, 9 + Math.log2(count) * 2.4);
}

/** Compact count for the bubble read-out: 842 · 1.2k · 38k */
export function formatMarkerCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}

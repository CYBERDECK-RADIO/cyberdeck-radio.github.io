/**
 * Radio Atlas cartography: the full-bleed stylized vector world.
 *
 *   stations + health ──▶ buildStationMarkers(view) ──▶ pips + clusters
 *   drag / pinch / wheel / keys ──▶ view {x,y,scale} ──▶ transform
 *   pip click ──▶ onSelectStation(id, { autoplay: true })
 *   cluster click ──▶ fit-zoom until the channels split ──▶ animated fly
 *                  └▶ too stacked to split ──▶ ClusterPicker dropdown
 *   gesture settle ──▶ onSelectStation(nearest)   (lock only, never plays)
 *
 * Every channel in the catalog is fair game: markers are clustered per view so
 * a 38k-channel crawl paints a few hundred readable nodes instead of 38k pips,
 * and the grid coarsens on its own when a metro explodes past the budget.
 *
 * Deep dives follow the same grid: a cluster click finds the zoom where its
 * channels stop sharing cells (verified against a real marker rebuild) and
 * flies there, while a co-located city — which no zoom can pull apart — hands
 * its channels to the anchored picker dropdown instead.
 *
 * Deliberately tile-free: Natural Earth outlines are bundled, so the map needs
 * no API key and stays a quiet backdrop for the pips.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type Station from '../../stations/types';
import type { HealthStatus } from '../../stations/stream-health-logic';
import { findNearestStation } from '../../map/nearest-station';
import { worldCountries } from '../../map/world-data';
import ClusterPicker from './ClusterPicker';
import PipShape from './theme/PipShape';
import { DEFAULT_THEME_ID, getThemeDefinition, type ThemeId } from '@/preferences/themes';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  buildStationMarkers,
  clusterRadius,
  dominantCountry,
  findSeparationScale,
  formatMarkerCount,
  hasUsableCoordinates,
  project,
  type AtlasMarker,
  type ClusterMarker,
  type MapView,
} from '../../map/station-markers';

type AtlasWorldProps = {
  stations: Station[];
  selectedStationId: string | null;
  healthById?: ReadonlyMap<string, HealthStatus>;
  /** Pinned channels, drawn with a kept-channel ring among the pips. */
  pinnedIds?: ReadonlySet<string>;
  /** Matched channels during active search. */
  matchedIds?: ReadonlySet<string>;
  /** The active skin: decides the station-pin glyph. */
  theme?: ThemeId;
  /** A pip interaction locks and plays; a pan-settle only locks. */
  onSelectStation: (stationId: string, options?: { autoplay?: boolean }) => void;
};

type Point = { x: number; y: number };
type Gesture =
  | { kind: 'pan'; pointerId: number; start: Point; view: MapView; moved: boolean }
  | { kind: 'pinch'; startDistance: number; startScale: number; anchor: Point };

type Hint = {
  key: string;
  left: number;
  top: number;
  title: string;
  detail: string;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const INITIAL_VIEW: MapView = { x: 0, y: 0, scale: 1 };
const EMPTY_HEALTH: ReadonlyMap<string, HealthStatus> = new Map();
const EMPTY_PINNED: ReadonlySet<string> = new Set();
const FLY_DURATION_MS = 480;
/** Marker geometry is authored in pixels; SVG units need the letterbox factor. */
const FALLBACK_FIT = 1;

function ringPath(ring: GeoJSON.Position[]): string {
  if (ring.length < 3) return '';
  const [first, ...rest] = ring;
  const start = project(first[0], first[1]);
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} ${rest
    .map((position) => {
      const point = project(position[0], position[1]);
      return `L${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(' ')}Z`;
}

function geometryPath(geometry: GeoJSON.Geometry | null): string {
  if (!geometry) return '';
  if (geometry.type === 'Polygon') return geometry.coordinates.map(ringPath).join(' ');
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) => polygon.map(ringPath)).join(' ');
  }
  return '';
}

function constrainView(view: MapView): MapView {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale));
  return {
    scale,
    x: Math.min(0, Math.max(MAP_WIDTH * (1 - scale), view.x)),
    y: Math.min(0, Math.max(MAP_HEIGHT * (1 - scale), view.y)),
  };
}

/**
 * Convert a client point to viewBox units, honouring the `meet` letterboxing so
 * pips still line up with continents on any viewport shape.
 */
function toWorldPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const rect = svg.getBoundingClientRect();
  const fit = Math.min(rect.width / MAP_WIDTH, rect.height / MAP_HEIGHT) || 1;
  const offsetX = (rect.width - MAP_WIDTH * fit) / 2;
  const offsetY = (rect.height - MAP_HEIGHT * fit) / 2;
  return {
    x: (clientX - rect.left - offsetX) / fit,
    y: (clientY - rect.top - offsetY) / fit,
  };
}

function centerCoordinates(view: MapView): [number, number] {
  const longitude = (((MAP_WIDTH / 2 - view.x) / view.scale) / MAP_WIDTH) * 360 - 180;
  const latitude = 90 - (((MAP_HEIGHT / 2 - view.y) / view.scale) / MAP_HEIGHT) * 180;
  return [Math.max(-180, Math.min(180, longitude)), Math.max(-90, Math.min(90, latitude))];
}

function centeredOnPoint(x: number, y: number, scale: number): MapView {
  return constrainView({
    scale,
    x: MAP_WIDTH / 2 - x * scale,
    y: MAP_HEIGHT / 2 - y * scale,
  });
}

function centeredView(longitude: number, latitude: number, scale: number): MapView {
  const point = project(longitude, latitude);
  return centeredOnPoint(point.x, point.y, scale);
}

function stationFocusView(view: MapView, coordinates: [number, number]): MapView {
  return centeredView(coordinates[0], coordinates[1], Math.max(2.2, view.scale));
}

/** Is the station still on the sheet? Used to avoid needless fly-tos. */
function isInViewport(coordinates: [number, number], view: MapView): boolean {
  const point = project(coordinates[0], coordinates[1]);
  const screenX = point.x * view.scale + view.x;
  const screenY = point.y * view.scale + view.y;
  return screenX >= 0 && screenX <= MAP_WIDTH && screenY >= 0 && screenY <= MAP_HEIGHT;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Projected positions of a cluster's channels — the crowd a deep dive splits. */
function clusterPoints(marker: ClusterMarker): Point[] {
  const points: Point[] = [];
  for (const station of marker.stations) {
    if (!hasUsableCoordinates(station.coordinates)) continue;
    points.push(project(station.coordinates[0], station.coordinates[1]));
  }
  return points;
}

function centroidOf(points: readonly Point[]): Point {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  const count = Math.max(1, points.length);
  return { x: total.x / count, y: total.y / count };
}

type PickerState = {
  stations: Station[];
  title: string;
  left: number;
  top: number;
};

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const countryPaths = worldCountries.features.map((feature, index) => ({
  id: String(feature.id ?? index),
  path: geometryPath(feature.geometry as GeoJSON.Geometry | null),
}));

/** Static cartography: memoised so re-renders only touch the markers. */
const WorldShapes = ({ scale }: { scale: number }) => (
  <>
    <g className="atlas-world__countries">
      {countryPaths.map((country) => (
        <path key={country.id} d={country.path} />
      ))}
    </g>
    <span className="sr-only">Map zoom level {scale.toFixed(1)} of {MAX_ZOOM}</span>
  </>
);

function pipLabel(station: Station): string {
  return station.country ? `${station.name}, ${station.country}` : station.name;
}

export default function AtlasWorld({
  stations,
  selectedStationId,
  healthById = EMPTY_HEALTH,
  pinnedIds = EMPTY_PINNED,
  matchedIds = EMPTY_PINNED,
  theme = DEFAULT_THEME_ID,
  onSelectStation,
}: AtlasWorldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const viewRef = useRef(INITIAL_VIEW);
  const stationsRef = useRef(stations);
  const selectedIdRef = useRef(selectedStationId);
  const selectRef = useRef(onSelectStation);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const autoLockRef = useRef(false);
  const flownRef = useRef<string | null>(null);
  const clusterElRef = useRef<SVGGElement | null>(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const [interacting, setInteracting] = useState(false);
  const [fit, setFit] = useState(FALLBACK_FIT);
  const [hint, setHint] = useState<Hint | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);

  const mappedStations = useMemo(() => stations.filter((station) => hasUsableCoordinates(station.coordinates)), [stations]);
  const markers = useMemo(
    () => buildStationMarkers(mappedStations, view, { selectedId: selectedStationId }),
    [mappedStations, view, selectedStationId],
  );
  const markerScale = fit > 0 ? 1 / fit : 1;
  const pipShape = getThemeDefinition(theme).pip;

  stationsRef.current = stations;
  selectedIdRef.current = selectedStationId;
  selectRef.current = onSelectStation;

  const cancelFlight = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const commitView = useCallback((next: MapView, updateReact = true) => {
    const resolved = constrainView(next);
    viewRef.current = resolved;
    worldRef.current?.setAttribute(
      'transform',
      `translate(${resolved.x} ${resolved.y}) scale(${resolved.scale})`,
    );
    // The picker is anchored to a bubble; any camera move leaves it stranded.
    setPicker(null);
    if (updateReact) setView(resolved);
  }, []);

  /** Eased fly-to: zooming into a crowd should feel like a camera, not a cut. */
  const animateTo = useCallback(
    (target: MapView) => {
      cancelFlight();
      setHint(null);
      const from = viewRef.current;
      const to = constrainView(target);
      if (
        Math.abs(from.x - to.x) < 0.5 &&
        Math.abs(from.y - to.y) < 0.5 &&
        Math.abs(from.scale - to.scale) < 0.01
      ) {
        commitView(to);
        return;
      }
      const startedAt = window.performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / FLY_DURATION_MS);
        const eased = easeInOutCubic(progress);
        commitView(
          {
            x: from.x + (to.x - from.x) * eased,
            y: from.y + (to.y - from.y) * eased,
            scale: from.scale + (to.scale - from.scale) * eased,
          },
          true,
        );
        frameRef.current = progress < 1 ? window.requestAnimationFrame(step) : null;
      };
      frameRef.current = window.requestAnimationFrame(step);
    },
    [cancelFlight, commitView],
  );

  const selectNearest = useCallback(() => {
    const nearest = findNearestStation(stationsRef.current, centerCoordinates(viewRef.current));
    if (nearest && nearest.id !== selectedIdRef.current) {
      autoLockRef.current = true;
      selectRef.current(nearest.id);
    }
  }, []);

  const finishGesture = useCallback(() => {
    gestureRef.current = null;
    pointersRef.current.clear();
    setInteracting(false);
    setView(viewRef.current);
    selectNearest();
  }, [selectNearest]);

  // Follow the locked station: a deliberate pick flies to it, while a
  // pan-settle lock only nudges the view when the station drifted off-screen —
  // exploring the atlas must never snap back under the cursor.
  useEffect(() => {
    if (selectedStationId === null) {
      flownRef.current = null;
      autoLockRef.current = false;
      return;
    }
    const autoLocked = autoLockRef.current;
    autoLockRef.current = false;
    if (flownRef.current === selectedStationId) return;
    flownRef.current = selectedStationId;
    const selected = stations.find((station) => station.id === selectedStationId);
    if (!selected || !hasUsableCoordinates(selected.coordinates)) return;

    if (autoLocked) {
      if (isInViewport(selected.coordinates, viewRef.current)) return;
      animateTo(centeredView(selected.coordinates[0], selected.coordinates[1], viewRef.current.scale));
      return;
    }
    animateTo(stationFocusView(viewRef.current, selected.coordinates));
  }, [animateTo, selectedStationId, stations]);

  // Nothing locked yet: put the nearest signal on the card (lock only — no audio).
  useEffect(() => {
    if (selectedStationId !== null) return;
    const nearest = findNearestStation(stations, centerCoordinates(viewRef.current));
    if (nearest) {
      autoLockRef.current = true;
      selectRef.current(nearest.id);
    }
  }, [selectedStationId, stations]);

  // A new result set (scan, source switch, facet) retires any open picker:
  // the channels it listed may no longer exist.
  useEffect(() => {
    setPicker(null);
  }, [stations]);

  // Markers are authored in pixels, so measure the letterbox factor and scale
  // every node back out of viewBox units.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const next = Math.min(rect.width / MAP_WIDTH, rect.height / MAP_HEIGHT) || FALLBACK_FIT;
      setFit((current) => (Math.abs(current - next) < 0.001 ? current : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => cancelFlight(), [cancelFlight]);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  function showHint(marker: AtlasMarker, event: ReactPointerEvent<SVGGElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = event.clientX - rect.left;
    const top = event.clientY - rect.top;
    if (marker.kind === 'cluster') {
      const country = dominantCountry(marker.stations);
      const action = canSplitCluster(marker) ? 'tap to expand' : 'tap to choose';
      setHint({
        key: marker.key,
        left,
        top,
        title: `${marker.count.toLocaleString()} channels`,
        detail: country ? `${country} · ${action}` : action,
      });
      return;
    }
    const station = marker.station;
    setHint({
      key: marker.key,
      left,
      top,
      title: station.name || 'Untitled station',
      detail: station.country ? `${station.country} · click to tune` : 'click to tune',
    });
  }

  function hideHint(key: string) {
    setHint((current) => (current?.key === key ? null : current));
  }

  const closePicker = useCallback(() => setPicker(null), []);

  const handlePickerSelect = useCallback(
    (stationId: string) => {
      setPicker(null);
      selectRef.current(stationId, { autoplay: true });
    },
    [],
  );

  /**
   * Would a fly-to to this view paint every channel of the crowd as its own
   * pip? The estimate from the grid is honest about co-located points, but the
   * marker budget can still coarsen cells — so the answer is read back from a
   * real rebuild rather than trusted from the closed form.
   */
  function clusterSeparatesAt(marker: ClusterMarker, target: MapView): boolean {
    const memberIds = new Set(marker.stations.map((station) => station.id));
    let solo = 0;
    const built = buildStationMarkers(mappedStations, target, {
      selectedId: selectedIdRef.current,
    });
    for (const marker2 of built) {
      if (marker2.kind === 'station' && memberIds.has(marker2.station.id)) solo += 1;
    }
    return solo === memberIds.size;
  }

  function openPicker(marker: ClusterMarker, source: SVGGElement | null) {
    const current = viewRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    const offsetX = rect ? (rect.width - MAP_WIDTH * fit) / 2 : 0;
    const offsetY = rect ? (rect.height - MAP_HEIGHT * fit) / 2 : 0;
    const country = dominantCountry(marker.stations);
    const countLabel = `${marker.count.toLocaleString()} channels`;
    clusterElRef.current = source;
    setHint(null);
    setPicker({
      stations: marker.stations,
      title: country ? `${countLabel} · ${country}` : countLabel,
      left: offsetX + (marker.x * current.scale + current.x) * fit + 14,
      top: offsetY + (marker.y * current.scale + current.y) * fit + 14,
    });
  }

  /**
   * Deep dive: fly to the zoom where the crowd splits into pips, and when no
   * zoom can (co-located city channels), hand the channels to the picker.
   */
  function handleClusterActivate(marker: ClusterMarker, source: SVGGElement | null) {
    const current = viewRef.current;
    const points = clusterPoints(marker);
    const estimate = findSeparationScale(
      points,
      Math.max(current.scale, MIN_ZOOM),
      MAX_ZOOM,
    );
    if (estimate === null) {
      openPicker(marker, source);
      return;
    }

    const center = centroidOf(points);
    const candidates: number[] = [];
    if (estimate > current.scale + 0.01) candidates.push(estimate);
    // Separable on the fine grid but merged anyway: the budget coarsened the
    // cells, so zoom in to thin the visible crowd and try again.
    else candidates.push(Math.min(MAX_ZOOM, current.scale * 2.1));
    if (candidates[0] < MAX_ZOOM - 0.01) candidates.push(MAX_ZOOM);

    for (const scale of candidates) {
      const target = centeredOnPoint(center.x, center.y, scale);
      if (clusterSeparatesAt(marker, target)) {
        animateTo(target);
        return;
      }
    }
    openPicker(marker, source);
  }

  /** Can this crowd be zoomed apart, or does it owe the visitor a picker? */
  function canSplitCluster(marker: ClusterMarker): boolean {
    return (
      findSeparationScale(
        clusterPoints(marker),
        Math.max(viewRef.current.scale, MIN_ZOOM),
        MAX_ZOOM,
      ) !== null
    );
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    cancelFlight();
    setHint(null);
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    const svg = event.currentTarget;
    const point = toWorldPoint(svg, event.clientX, event.clientY);
    svg.setPointerCapture(event.pointerId);
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, point);
    setInteracting(true);

    if (pointers.size >= 2) {
      const [first, second] = Array.from(pointers.values());
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const current = viewRef.current;
      gestureRef.current = {
        kind: 'pinch',
        startDistance: Math.max(1, distance(first, second)),
        startScale: current.scale,
        anchor: {
          x: (midpoint.x - current.x) / current.scale,
          y: (midpoint.y - current.y) / current.scale,
        },
      };
      return;
    }

    gestureRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      start: point,
      view: viewRef.current,
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = toWorldPoint(event.currentTarget, event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, point);
    const gesture = gestureRef.current;

    if (gesture?.kind === 'pan' && gesture.pointerId === event.pointerId) {
      const dx = point.x - gesture.start.x;
      const dy = point.y - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) > 3) gesture.moved = true;
      commitView({ ...gesture.view, x: gesture.view.x + dx, y: gesture.view.y + dy }, false);
      return;
    }

    if (gesture?.kind === 'pinch' && pointersRef.current.size >= 2) {
      const [first, second] = Array.from(pointersRef.current.values());
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const scale = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, (gesture.startScale * distance(first, second)) / gesture.startDistance),
      );
      commitView({
        scale,
        x: midpoint.x - gesture.anchor.x * scale,
        y: midpoint.y - gesture.anchor.y * scale,
      });
    }
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [pointerId, start] = Array.from(pointersRef.current.entries())[0];
      gestureRef.current = { kind: 'pan', pointerId, start, view: viewRef.current, moved: true };
      return;
    }
    if (pointersRef.current.size === 0) finishGesture();
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    cancelFlight();
    const point = toWorldPoint(event.currentTarget, event.clientX, event.clientY);
    const current = viewRef.current;
    const scale = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, current.scale * Math.exp(-event.deltaY * 0.0015)),
    );
    commitView({
      scale,
      x: point.x - ((point.x - current.x) / current.scale) * scale,
      y: point.y - ((point.y - current.y) / current.scale) * scale,
    });
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(finishGesture, 160);
  }

  function handleMapKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 110 : 55;
    const current = viewRef.current;
    let next: MapView | null = null;
    if (event.key === 'ArrowLeft') next = { ...current, x: current.x + step };
    if (event.key === 'ArrowRight') next = { ...current, x: current.x - step };
    if (event.key === 'ArrowUp') next = { ...current, y: current.y + step };
    if (event.key === 'ArrowDown') next = { ...current, y: current.y - step };
    if (event.key === '+' || event.key === '=') next = { ...current, scale: current.scale * 1.35 };
    if (event.key === '-') next = { ...current, scale: current.scale / 1.35 };
    if (!next) return;
    event.preventDefault();
    cancelFlight();
    commitView(next);
    selectNearest();
  }

  function zoomBy(factor: number) {
    const current = viewRef.current;
    const center = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor));
    cancelFlight();
    commitView({
      scale,
      x: center.x - ((center.x - current.x) / current.scale) * scale,
      y: center.y - ((center.y - current.y) / current.scale) * scale,
    });
    selectNearest();
  }

  return (
    <div className={`atlas-world${interacting ? ' is-interacting' : ''}`} data-testid="atlas-world" ref={containerRef}>
      <svg
        className="atlas-world__grid"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line className="atlas-world__axis atlas-world__axis--equator" x1={0} x2={MAP_WIDTH} y1={MAP_HEIGHT / 2} y2={MAP_HEIGHT / 2} />
        <line className="atlas-world__axis" x1={MAP_WIDTH / 2} x2={MAP_WIDTH / 2} y1={0} y2={MAP_HEIGHT} />
      </svg>

      <svg
        ref={svgRef}
        className="atlas-world__svg"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="application"
        aria-label="World map of stations. Drag to pan, scroll or pinch to zoom, and select a station pip to play it."
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleMapKeyDown}
      >
        <g
          ref={worldRef}
          className="atlas-world__world"
          transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
        >
          <WorldShapes scale={view.scale} />
          {markers.map((marker) => {
            const groupTransform = `translate(${marker.x} ${marker.y}) scale(${markerScale / view.scale})`;

            if (marker.kind === 'cluster') {
              const radius = clusterRadius(marker.count);
              return (
                <g
                  key={marker.key}
                  className="atlas-world__cluster"
                  transform={groupTransform}
                  role="button"
                  tabIndex={0}
                  aria-label={`Zoom to ${marker.count} channels`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={(event) => showHint(marker, event)}
                  onPointerLeave={() => hideHint(marker.key)}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleClusterActivate(marker, event.currentTarget);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleClusterActivate(marker, event.currentTarget);
                    }
                  }}
                >
                  <circle className="atlas-world__cluster-halo" r={radius + 7} />
                  <circle className="atlas-world__cluster-ring" r={radius} />
                  <circle className="atlas-world__cluster-core" r={Math.max(5, radius - 6)} />
                  <text className="atlas-world__cluster-count" dy="0.34em" textAnchor="middle">
                    {formatMarkerCount(marker.count)}
                  </text>
                </g>
              );
            }

            const station = marker.station;
            const isSelected = station.id === selectedStationId;
            const isPinned = pinnedIds.has(station.id);
            const isMatched = matchedIds.has(station.id);
            const health = healthById.get(station.id) ?? 'unknown';
            return (
              <g
                key={marker.key}
                className={`atlas-world__pip health-${health}${isSelected ? ' is-selected' : ''}${isPinned ? ' is-pinned' : ''}${isMatched ? ' is-matched' : ''}`}
                transform={groupTransform}
                role="button"
                tabIndex={0}
                aria-label={`Play ${pipLabel(station)}`}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerEnter={(event) => showHint(marker, event)}
                onPointerLeave={() => hideHint(marker.key)}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectStation(station.id, { autoplay: true });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectStation(station.id, { autoplay: true });
                  }
                }}
              >
                <circle className="atlas-world__ping" r={13} />
                <PipShape shape={pipShape} />
                <title>{station.name}</title>
              </g>
            );
          })}
        </g>
      </svg>

      {hint && (
        <div
          className="atlas-world__hint"
          style={{ left: hint.left, top: hint.top }}
          role="presentation"
          aria-hidden="true"
        >
          <span className="atlas-world__hint-title">{hint.title}</span>
          <span className="atlas-world__hint-detail">{hint.detail}</span>
        </div>
      )}

      {picker && (
        <ClusterPicker
          stations={picker.stations}
          title={picker.title}
          left={picker.left}
          top={picker.top}
          healthById={healthById}
          onSelect={handlePickerSelect}
          onClose={closePicker}
          returnFocusRef={clusterElRef}
        />
      )}

      <div className="atlas-world__controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>−</button>
        <button type="button" aria-label="Show whole world" onClick={() => animateTo(INITIAL_VIEW)}>
          WORLD
        </button>
      </div>
      <span className="atlas-world__credit">© Natural Earth</span>
    </div>
  );
}

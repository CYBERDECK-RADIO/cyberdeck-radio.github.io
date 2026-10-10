import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import type Station from '../stations/types';
import { findNearestStation } from '../map/nearest-station';
import { worldCountries } from '../map/world-data';

type StationMapFallbackProps = {
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
};

type View = { x: number; y: number; scale: number };
type Point = { x: number; y: number };
type Gesture =
  | { kind: 'pan'; pointerId: number; start: Point; view: View; moved: boolean }
  | { kind: 'pinch'; startDistance: number; startScale: number; anchor: Point };

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const INITIAL_VIEW: View = { x: 0, y: 0, scale: 1 };

function project([longitude, latitude]: GeoJSON.Position): Point {
  return {
    x: ((longitude + 180) / 360) * MAP_WIDTH,
    y: ((90 - latitude) / 180) * MAP_HEIGHT,
  };
}

function ringPath(ring: GeoJSON.Position[]): string {
  if (ring.length < 3) return '';
  const [first, ...rest] = ring;
  const start = project(first);
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} ${rest
    .map((position) => {
      const point = project(position);
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

function validCoordinates(coordinates?: Station['coordinates']): coordinates is [number, number] {
  if (!coordinates) return false;
  const [longitude, latitude] = coordinates;
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function constrainView(view: View): View {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale));
  return {
    scale,
    x: Math.min(0, Math.max(MAP_WIDTH * (1 - scale), view.x)),
    y: Math.min(0, Math.max(MAP_HEIGHT * (1 - scale), view.y)),
  };
}

function pointerPoint(event: PointerEvent<SVGSVGElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * MAP_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT,
  };
}

function centerCoordinates(view: View): [number, number] {
  const longitude = (((MAP_WIDTH / 2 - view.x) / view.scale) / MAP_WIDTH) * 360 - 180;
  const latitude = 90 - (((MAP_HEIGHT / 2 - view.y) / view.scale) / MAP_HEIGHT) * 180;
  return [Math.max(-180, Math.min(180, longitude)), Math.max(-90, Math.min(90, latitude))];
}

function stationFocusView(view: View, coordinates: [number, number]): View {
  const scale = Math.max(2.2, view.scale);
  const point = project(coordinates);
  return constrainView({
    scale,
    x: MAP_WIDTH / 2 - point.x * scale,
    y: MAP_HEIGHT / 2 - point.y * scale,
  });
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function StationMapFallback({
  stations,
  selectedStationId,
  onSelectStation,
}: StationMapFallbackProps) {
  const worldRef = useRef<SVGGElement>(null);
  const viewRef = useRef(INITIAL_VIEW);
  const stationsRef = useRef(stations);
  const selectedIdRef = useRef(selectedStationId);
  const selectRef = useRef(onSelectStation);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [view, setView] = useState(INITIAL_VIEW);
  const [interacting, setInteracting] = useState(false);
  const [wheelActive, setWheelActive] = useState(false);
  const mappedStations = useMemo(
    () => stations.filter((station) => validCoordinates(station.coordinates)),
    [stations],
  );
  const countryPaths = useMemo(
    () => worldCountries.features.map((feature, index) => ({
      id: String(feature.id ?? index),
      path: geometryPath(feature.geometry as GeoJSON.Geometry | null),
    })),
    [],
  );

  stationsRef.current = stations;
  selectedIdRef.current = selectedStationId;
  selectRef.current = onSelectStation;

  const commitView = useCallback((nextView: View, updateReact = true) => {
    const next = constrainView(nextView);
    viewRef.current = next;
    worldRef.current?.setAttribute('transform', `translate(${next.x} ${next.y}) scale(${next.scale})`);
    if (updateReact) setView(next);
  }, []);

  const selectNearest = useCallback(() => {
    const nearest = findNearestStation(stationsRef.current, centerCoordinates(viewRef.current));
    if (nearest && nearest.id !== selectedIdRef.current) selectRef.current(nearest.id);
  }, []);

  const finishGesture = useCallback(() => {
    gestureRef.current = null;
    pointersRef.current.clear();
    setInteracting(false);
    setWheelActive(false);
    setView(viewRef.current);
    selectNearest();
  }, [selectNearest]);

  useEffect(() => {
    if (selectedStationId === null) return;
    const selected = stations.find((station) => station.id === selectedStationId);
    if (!selected || !validCoordinates(selected.coordinates)) return;
    commitView(stationFocusView(viewRef.current, selected.coordinates));
  }, [commitView, selectedStationId, stations]);

  useEffect(() => {
    if (selectedStationId !== null) return;
    const nearest = findNearestStation(stations, centerCoordinates(viewRef.current));
    if (nearest) selectRef.current(nearest.id);
  }, [selectedStationId, stations]);

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
      setWheelActive(false);
    }
    const point = pointerPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
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
        anchor: { x: (midpoint.x - current.x) / current.scale, y: (midpoint.y - current.y) / current.scale },
      };
      return;
    }

    gestureRef.current = { kind: 'pan', pointerId: event.pointerId, start: point, view: viewRef.current, moved: false };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    const point = pointerPoint(event);
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
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gesture.startScale * distance(first, second) / gesture.startDistance));
      commitView({
        scale,
        x: midpoint.x - gesture.anchor.x * scale,
        y: midpoint.y - gesture.anchor.y * scale,
      }, false);
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const [pointerId, start] = Array.from(pointersRef.current.entries())[0];
      gestureRef.current = { kind: 'pan', pointerId, start, view: viewRef.current, moved: true };
      return;
    }
    if (pointersRef.current.size === 0) finishGesture();
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * MAP_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT,
    };
    const current = viewRef.current;
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * Math.exp(-event.deltaY * 0.0015)));
    commitView({
      scale,
      x: point.x - ((point.x - current.x) / current.scale) * scale,
      y: point.y - ((point.y - current.y) / current.scale) * scale,
    }, false);
    setWheelActive(true);
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(finishGesture, 140);
  }

  function handleMapKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const step = event.shiftKey ? 110 : 55;
    const current = viewRef.current;
    let next: View | null = null;
    if (event.key === 'ArrowLeft') next = { ...current, x: current.x + step };
    if (event.key === 'ArrowRight') next = { ...current, x: current.x - step };
    if (event.key === 'ArrowUp') next = { ...current, y: current.y + step };
    if (event.key === 'ArrowDown') next = { ...current, y: current.y - step };
    if (event.key === '+' || event.key === '=') next = { ...current, scale: current.scale * 1.35 };
    if (event.key === '-') next = { ...current, scale: current.scale / 1.35 };
    if (!next) return;
    event.preventDefault();
    commitView(next);
    selectNearest();
  }

  function zoomBy(factor: number) {
    const current = viewRef.current;
    const center = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor));
    commitView({
      scale,
      x: center.x - ((center.x - current.x) / current.scale) * scale,
      y: center.y - ((center.y - current.y) / current.scale) * scale,
    });
  }

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  return (
    <div className={`station-map-fallback${interacting ? ' is-interacting' : ''}${wheelActive ? ' is-wheel-active' : ''}`}>
      <svg
        className="station-map-fallback__svg"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="application"
        aria-label="Interactive world map. Drag to pan, pinch or use the mouse wheel to zoom, and select a station marker."
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
          className="station-map-fallback__world"
          transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
        >
          {Array.from({ length: 7 }, (_, index) => {
            const longitude = -150 + index * 50;
            const x = ((longitude + 180) / 360) * MAP_WIDTH;
            return <path key={`lon-${longitude}`} className="station-map-fallback__graticule" d={`M${x} 0V${MAP_HEIGHT}`} />;
          })}
          {Array.from({ length: 5 }, (_, index) => {
            const latitude = -60 + index * 30;
            const y = ((90 - latitude) / 180) * MAP_HEIGHT;
            return <path key={`lat-${latitude}`} className="station-map-fallback__graticule" d={`M0 ${y}H${MAP_WIDTH}`} />;
          })}
          {countryPaths.map((country) => (
            <path key={country.id} className="station-map-fallback__country" d={country.path} />
          ))}
          {mappedStations.map((station) => {
            const point = project(station.coordinates!);
            const isSelected = station.id === selectedStationId;
            return (
              <g
                key={station.id}
                className={`station-map-fallback__marker${isSelected ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`Focus ${station.name}${station.country ? `, ${station.country}` : ''}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectStation(station.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectStation(station.id);
                  }
                }}
              >
                <circle className="station-map-fallback__marker-halo" cx={point.x} cy={point.y} r={isSelected ? 9 : 6} />
                <circle className="station-map-fallback__marker-dot" cx={point.x} cy={point.y} r={isSelected ? 4.5 : 3} />
                <title>{station.name}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="station-map-fallback__controls" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>−</button>
        <button
          type="button"
          aria-label="Show whole world"
          onClick={() => commitView(INITIAL_VIEW)}
        >
          WORLD
        </button>
      </div>
      <span className="station-map-fallback__credit">© Natural Earth</span>
      <span className="sr-only">Map zoom level {view.scale.toFixed(1)} of {MAX_ZOOM}</span>
    </div>
  );
}

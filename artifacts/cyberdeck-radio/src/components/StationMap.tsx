/**
 * World Broadcast Atlas map: a dark, living world where every station emits an
 * expanding radio-wave pulse, and panning the globe "tunes" the nearest signal.
 *
 *   stations + selectedId ──▶ GeoJSON source ──▶ graticule + pulse + point layers
 *   marker click ──▶ onSelectStation(id)
 *   map move settles ──▶ nearest station to center ──▶ onSelectStation(id)
 *   selectedId change ──▶ fly to marker
 *   no WebGL / init failure ──▶ StationMapFallback
 *
 * The pulse animation is a single rAF loop that nudges two paint properties;
 * it is disabled entirely under prefers-reduced-motion. Map lifecycle stays
 * inside this module.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre derives its worker URL from the main bundle's location, but Vite
// inlines the library and never emits that sibling file. Import it as a hashed
// asset and point MapLibre at it so the GeoJSON/tile worker actually loads.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Crosshair, Globe2, Minus, Plus } from 'lucide-react';
import type Station from '../stations/types';
import type { HealthStatus } from '../stations/stream-health-logic';
import { worldCountries } from '../map/world-data';
import { findNearestStation } from '../map/nearest-station';
import StationMapFallback from './StationMapFallback';
import './StationMap.css';

setWorkerUrl(maplibreWorkerUrl);

type StationMapProps = {
  stations: Station[];
  selectedStationId: string | null;
  healthById?: ReadonlyMap<string, HealthStatus>;
  onSelectStation: (stationId: string) => void;
  /** When the atlas has nothing mapped, the empty state becomes a real action. */
  onRequestSearch?: () => void;
  variant?: 'panel' | 'atlas';
};

const SOURCE_ID = 'cyberdeck-world';
const COUNTRY_FILL_ID = 'cyberdeck-country-fill';
const COUNTRY_LINE_ID = 'cyberdeck-country-lines';
const GRATICULE_SOURCE_ID = 'cyberdeck-graticule';
const GRATICULE_LAYER_ID = 'cyberdeck-graticule-lines';
const STATION_SOURCE_ID = 'cyberdeck-stations';
const STATION_LAYER_ID = 'cyberdeck-station-points';
const STATION_GLOW_LAYER_ID = 'cyberdeck-station-glow';
const PULSE_LAYER_ID = 'cyberdeck-station-pulses';
const SELECTED_PULSE_LAYER_ID = 'cyberdeck-station-selected-pulse';
const EMPTY_HEALTH: ReadonlyMap<string, HealthStatus> = new Map();

const WORLD_CENTER: [number, number] = [8, 18];
const WORLD_ZOOM = 0.9;
const PULSE_DURATION_MS = 2800;
const PULSE_BASE_MAX_RADIUS = 30;
const PULSE_SELECTED_MAX_RADIUS = 46;

function validCoordinates(coordinates?: [number, number]): coordinates is [number, number] {
  if (!coordinates || coordinates.length !== 2) return false;
  const [longitude, latitude] = coordinates;
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function phaseFor(id: string, index: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ((hash % 1000) / 1000 + index * 0.173) % 1;
}

function makeStationsGeoJSON(stations: Station[], selectedStationId: string | null, healthById: ReadonlyMap<string, HealthStatus>): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: stations.filter((station) => validCoordinates(station.coordinates)).map((station, index) => ({
      type: 'Feature',
      id: station.id,
      geometry: { type: 'Point', coordinates: station.coordinates! },
      properties: {
        id: station.id,
        name: station.name || 'Untitled station',
        country: station.country || '',
        selected: station.id === selectedStationId,
        health: healthById.get(station.id) ?? 'unknown',
        phase: phaseFor(station.id, index),
      },
    })),
  };
}

function makeGraticule(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let longitude = -150; longitude <= 150; longitude += 30) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[longitude, -84], [longitude, 84]] },
    });
  }
  for (let latitude = -60; latitude <= 60; latitude += 30) {
    const coordinates: [number, number][] = [];
    for (let longitude = -180; longitude <= 180; longitude += 4) coordinates.push([longitude, latitude]);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

// MapLibre's style-spec expression DSL is not surfaced through the bundled
// type exports, so the tiny expression builders below are intentionally loose.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Expression = any;

function phaseExpression(offset: number): Expression {
  return ['%', ['+', ['get', 'phase'], offset], 1];
}

function radiusExpression(offset: number, maxRadius: number): Expression {
  return ['interpolate', ['linear'], phaseExpression(offset), 0, 2, 1, maxRadius];
}

function opacityExpression(offset: number, peak: number): Expression {
  return ['interpolate', ['linear'], phaseExpression(offset), 0, 0, 0.18, peak, 1, 0];
}

export default function StationMap({ stations, selectedStationId, healthById = EMPTY_HEALTH, onSelectStation, onRequestSearch, variant = 'panel' }: StationMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [useVectorFallback, setUseVectorFallback] = useState(false);
  const [styleReady, setStyleReady] = useState(false);
  const stationsRef = useRef(stations);
  const selectedIdRef = useRef(selectedStationId);
  const selectRef = useRef(onSelectStation);
  const movementRef = useRef(false);
  const features = useMemo(() => makeStationsGeoJSON(stations, selectedStationId, healthById), [stations, selectedStationId, healthById]);
  const featuresRef = useRef(features);
  const mappedCount = features.features.length;
  const isAtlas = variant === 'atlas';

  stationsRef.current = stations;
  selectedIdRef.current = selectedStationId;
  selectRef.current = onSelectStation;
  featuresRef.current = features;

  const selectNearestAtCenter = useCallback((mapOverride?: MapLibreMap) => {
    const map = mapOverride ?? mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const nearest = findNearestStation(stationsRef.current, [center.lng, center.lat]);
    if (!nearest || nearest.id === selectedIdRef.current) return;
    selectRef.current(nearest.id);
  }, []);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const probe = document.createElement('canvas');
    const webglContext = probe.getContext('webgl2');
    webglContext?.getExtension('WEBGL_lose_context')?.loseContext();
    if (!webglContext) {
      setUseVectorFallback(true);
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: hostRef.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: 'receiver-background', type: 'background', paint: { 'background-color': '#0a1218' } }],
        },
        center: WORLD_CENTER,
        zoom: WORLD_ZOOM,
        minZoom: 0.75,
        maxZoom: 7,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: true,
        interactive: true,
        ...(reducedMotion ? { fadeDuration: 0 } : {}),
      });
    } catch {
      setUseVectorFallback(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: true, customAttribution: 'Natural Earth' }), 'bottom-right');

    let frame = 0;
    const stopPulse = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const startPulse = () => {
      if (reducedMotion || frame) return;
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (mapRef.current !== map || !map.getLayer(PULSE_LAYER_ID)) return;
        const offset = ((now - startedAt) % PULSE_DURATION_MS) / PULSE_DURATION_MS;
        map.setPaintProperty(PULSE_LAYER_ID, 'circle-radius', radiusExpression(offset, PULSE_BASE_MAX_RADIUS));
        map.setPaintProperty(PULSE_LAYER_ID, 'circle-opacity', opacityExpression(offset, 0.3));
        map.setPaintProperty(SELECTED_PULSE_LAYER_ID, 'circle-radius', radiusExpression((offset + 0.4) % 1, PULSE_SELECTED_MAX_RADIUS));
        map.setPaintProperty(SELECTED_PULSE_LAYER_ID, 'circle-opacity', opacityExpression((offset + 0.4) % 1, 0.55));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    map.on('load', () => {
      if (mapRef.current !== map) return;
      map.addSource(SOURCE_ID, { type: 'geojson', data: worldCountries as GeoJSON.FeatureCollection });
      map.addLayer({
        id: COUNTRY_FILL_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: { 'fill-color': '#1d3a3f', 'fill-opacity': 0.96 },
      });
      map.addLayer({
        id: COUNTRY_LINE_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': '#8ac3ad', 'line-width': 0.85, 'line-opacity': 0.7 },
      });

      map.addSource(GRATICULE_SOURCE_ID, { type: 'geojson', data: makeGraticule() });
      map.addLayer({
        id: GRATICULE_LAYER_ID,
        type: 'line',
        source: GRATICULE_SOURCE_ID,
        paint: { 'line-color': '#8fb8ac', 'line-width': 0.5, 'line-opacity': 0.17 },
      });

      map.addSource(STATION_SOURCE_ID, { type: 'geojson', data: makeStationsGeoJSON(stationsRef.current, selectedIdRef.current, EMPTY_HEALTH) });

      map.addLayer({
        id: PULSE_LAYER_ID,
        type: 'circle',
        source: STATION_SOURCE_ID,
        filter: ['!=', ['get', 'health'], 'offline'],
        paint: {
          'circle-radius': radiusExpression(0, PULSE_BASE_MAX_RADIUS),
          'circle-color': '#f0ca72',
          'circle-opacity': reducedMotion ? 0.16 : 0,
          'circle-blur': 0.75,
        },
      });
      map.addLayer({
        id: SELECTED_PULSE_LAYER_ID,
        type: 'circle',
        source: STATION_SOURCE_ID,
        filter: ['all', ['==', ['get', 'selected'], true], ['!=', ['get', 'health'], 'offline']],
        paint: {
          'circle-radius': radiusExpression(0.4, PULSE_SELECTED_MAX_RADIUS),
          'circle-color': '#ffe6a6',
          'circle-opacity': reducedMotion ? 0.4 : 0,
          'circle-blur': 0.55,
        },
      });
      map.addLayer({
        id: STATION_GLOW_LAYER_ID,
        type: 'circle',
        source: STATION_SOURCE_ID,
        filter: ['!=', ['get', 'health'], 'offline'],
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 18, 12],
          'circle-color': ['case', ['==', ['get', 'health'], 'checking'], '#ffd98c', '#f2c069'],
          'circle-opacity': 0.22,
          'circle-blur': 0.95,
        },
      });
      map.addLayer({
        id: STATION_LAYER_ID,
        type: 'circle',
        source: STATION_SOURCE_ID,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 9, ['==', ['get', 'health'], 'offline'], 4.5, ['==', ['get', 'health'], 'unknown'], 5, 6.5],
          'circle-color': ['case', ['boolean', ['get', 'selected'], false], '#ffe6a6', ['==', ['get', 'health'], 'offline'], '#c9564c', ['==', ['get', 'health'], 'checking'], '#ffd98c', ['==', ['get', 'health'], 'live'], '#f2c069', '#d6a963'],
          'circle-stroke-color': ['case', ['boolean', ['get', 'selected'], false], '#fff4d6', '#0a1218'],
          'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 2.2, 1.4],
          'circle-opacity': ['case', ['==', ['get', 'health'], 'offline'], 0.9, 0.98],
          'circle-blur': ['case', ['==', ['get', 'health'], 'offline'], 0.3, 0.12],
        },
      });

      (map.getSource(STATION_SOURCE_ID) as GeoJSONSource).setData(featuresRef.current);
      setStyleReady(true);
      selectNearestAtCenter(map);
      startPulse();
      map.on('mouseenter', STATION_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', STATION_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });
      map.on('click', STATION_LAYER_ID, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === 'string') selectRef.current(id);
      });
    });

    map.on('movestart', () => { movementRef.current = true; });
    map.on('moveend', () => {
      if (!movementRef.current) return;
      movementRef.current = false;
      selectNearestAtCenter(map);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(hostRef.current);

    return () => {
      stopPulse();
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      // Force the data effect to run again when the next map finishes loading.
      setStyleReady(false);
    };
  }, [selectNearestAtCenter]);

  useEffect(() => {
    // Gate on the source existing rather than isStyleLoaded(): a freshly added
    // GeoJSON source stays "not loaded" until its data arrives, so waiting for a
    // fully loaded style would deadlock the very setData that loads it.
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource(STATION_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(features);
    selectNearestAtCenter(map);
  }, [features, styleReady, selectNearestAtCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStationId) return;
    const selected = stations.find((station) => station.id === selectedStationId);
    if (!selected || !validCoordinates(selected.coordinates)) return;
    const target = selected.coordinates;
    const current = map.getCenter();
    const alreadyCentered = Math.abs(current.lng - target[0]) < 0.001 && Math.abs(current.lat - target[1]) < 0.001;
    if (alreadyCentered) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) map.jumpTo({ center: target });
    else map.easeTo({ center: target, duration: 850, essential: false });
  }, [selectedStationId, stations]);

  const tuneNearest = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getZoom() < 2) {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.easeTo({ zoom: 2.4, duration: reducedMotion ? 0 : 700 });
    }
    selectNearestAtCenter(map);
  }, [selectNearestAtCenter]);

  const showWorld = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyTo({ center: WORLD_CENTER, zoom: WORLD_ZOOM, duration: reducedMotion ? 0 : 900 });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const map = mapRef.current;
    if (!map) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anchor = map.getCenter();
    const target = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + factor));
    if (reducedMotion) map.jumpTo({ center: anchor, zoom: target });
    else map.easeTo({ center: anchor, zoom: target, duration: 320 });
  }, []);

  const emptyMessage = stations.length === 0
    ? 'Search for stations to reveal their signals.'
    : mappedCount === 0
      ? 'These stations have no usable coordinates.'
      : '';

  return (
    <section
      className={`station-map station-map--${variant}`}
      aria-label="World map of radio stations"
      data-testid="station-map"
    >
      {!isAtlas && (
        <div className="station-map__header">
          <div>
            <span className="station-map__eyebrow">02 — Signal origins</span>
            <h2>Across the airwaves</h2>
          </div>
          <span className="station-map__count" aria-live="polite">
            {mappedCount.toString().padStart(2, '0')} / {stations.length.toString().padStart(2, '0')} MAPPED
          </span>
        </div>
      )}
      <div className="station-map__frame">
        <div className="station-map__canvas" data-testid="station-map-canvas">
          {useVectorFallback ? (
            <StationMapFallback
              stations={stations}
              selectedStationId={selectedStationId}
              onSelectStation={onSelectStation}
            />
          ) : (
            <div
              ref={hostRef}
              className="station-map__engine"
              role="application"
              aria-label="Interactive map. Drag to pan, use the mouse wheel or touch gestures to zoom, and select a station marker."
            />
          )}
        </div>
        <div className="station-map__corner" aria-hidden="true">RX · WORLD BAND</div>
        {isAtlas && (
          <span className="station-map__count station-map__count--atlas" aria-live="polite">
            {mappedCount.toString().padStart(2, '0')} / {stations.length.toString().padStart(2, '0')} MAPPED
          </span>
        )}
        {!useVectorFallback && (
          <div className="station-map__tune" role="group" aria-label="Map tuning">
            <button type="button" onClick={tuneNearest}>
              <Crosshair aria-hidden="true" /> Tune nearest
            </button>
            <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">
              <Plus aria-hidden="true" />
            </button>
            <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">
              <Minus aria-hidden="true" />
            </button>
            <button type="button" onClick={showWorld} aria-label="Show whole world">
              <Globe2 aria-hidden="true" />
            </button>
          </div>
        )}
        {emptyMessage && (
          <div className="station-map__empty" role="status">
            <span className="station-map__empty-mark" aria-hidden="true" />
            <p>{emptyMessage}</p>
            {stations.length === 0 && onRequestSearch && (
              <button type="button" className="station-map__empty-cta" onClick={onRequestSearch} data-testid="button-map-scan">
                <Crosshair aria-hidden="true" /> Scan the dial
              </button>
            )}
          </div>
        )}
        {mappedCount > 0 && (
          <p className="station-map__instructions">DRAG TO SCAN <span>·</span> WHEEL / PINCH TO ZOOM <span>·</span> PAN TO TUNE NEAREST</p>
        )}
      </div>
    </section>
  );
}

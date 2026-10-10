/**
 * MapLibre world map: renders country outlines and station markers, and keeps
 * selection synchronized with the list.
 *
 *   stations + selectedId ──▶ GeoJSON source ──▶ circle layer
 *   marker click ──▶ onSelectStation(id)
 *   selectedId change ──▶ fly to marker
 *   no WebGL / init failure ──▶ StationMapFallback
 *
 * Map lifecycle and marker bookkeeping stay inside this module.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type Station from '../stations/types';
import { worldCountries } from '../map/world-data';
import { findNearestStation } from '../map/nearest-station';
import StationMapFallback from './StationMapFallback';
import './StationMap.css';

type StationMapProps = {
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
};

const SOURCE_ID = 'cyberdeck-world';
const COUNTRY_FILL_ID = 'cyberdeck-country-fill';
const COUNTRY_LINE_ID = 'cyberdeck-country-lines';
const STATION_SOURCE_ID = 'cyberdeck-stations';
const STATION_LAYER_ID = 'cyberdeck-station-points';

function validCoordinates(coordinates?: [number, number]): coordinates is [number, number] {
  if (!coordinates || coordinates.length !== 2) return false;
  const [longitude, latitude] = coordinates;
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function makeStationsGeoJSON(stations: Station[], selectedStationId: string | null): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: stations.filter((station) => validCoordinates(station.coordinates)).map((station) => ({
      type: 'Feature',
      id: station.id,
      geometry: { type: 'Point', coordinates: station.coordinates! },
      properties: {
        id: station.id,
        name: station.name || 'Untitled station',
        country: station.country || '',
        selected: station.id === selectedStationId,
      },
    })),
  };
}

export default function StationMap({ stations, selectedStationId, onSelectStation }: StationMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [useVectorFallback, setUseVectorFallback] = useState(false);
  const stationsRef = useRef(stations);
  const selectedIdRef = useRef(selectedStationId);
  const selectRef = useRef(onSelectStation);
  const movementRef = useRef(false);
  const features = useMemo(() => makeStationsGeoJSON(stations, selectedStationId), [stations, selectedStationId]);
  const mappedCount = features.features.length;

  stationsRef.current = stations;
  selectedIdRef.current = selectedStationId;
  selectRef.current = onSelectStation;

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
          layers: [{ id: 'receiver-background', type: 'background', paint: { 'background-color': '#182126' } }],
        },
        center: [8, 18],
        zoom: 0.9,
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
    map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
    map.on('load', () => {
      if (mapRef.current !== map) return;
      map.addSource(SOURCE_ID, { type: 'geojson', data: worldCountries as GeoJSON.FeatureCollection });
      map.addLayer({
        id: COUNTRY_FILL_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: { 'fill-color': '#28383a', 'fill-opacity': 0.92 },
      });
      map.addLayer({
        id: COUNTRY_LINE_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': '#60716b', 'line-width': 0.65, 'line-opacity': 0.62 },
      });
      map.addSource(STATION_SOURCE_ID, { type: 'geojson', data: makeStationsGeoJSON(stationsRef.current, selectedIdRef.current) });
      map.addLayer({
        id: STATION_LAYER_ID,
        type: 'circle',
        source: STATION_SOURCE_ID,
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 7, 4],
          'circle-color': ['case', ['boolean', ['get', 'selected'], false], '#f0ca72', '#df9e58'],
          'circle-stroke-color': '#172126',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.96,
        },
      });
      selectNearestAtCenter(map);
      map.on('mouseenter', STATION_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', STATION_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });
      map.on('click', STATION_LAYER_ID, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === 'string') {
          selectRef.current(id);
        }
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
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [selectNearestAtCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const source = map.getSource(STATION_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(features);
    selectNearestAtCenter(map);
  }, [features, selectNearestAtCenter]);

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

  const emptyMessage = stations.length === 0
    ? 'Search for stations to reveal their signals.'
    : mappedCount === 0
      ? 'These stations have no usable coordinates.'
      : '';

  return (
    <section className="station-map" aria-label="World map of radio stations" data-testid="station-map">
      <div className="station-map__header">
        <div>
          <span className="station-map__eyebrow">02 — Signal origins</span>
          <h2>Across the airwaves</h2>
        </div>
        <span className="station-map__count" aria-live="polite">
          {mappedCount.toString().padStart(2, '0')} / {stations.length.toString().padStart(2, '0')} MAPPED
        </span>
      </div>
      <div className="station-map__frame">
        <div
          className="station-map__canvas"
          data-testid="station-map-canvas"
        >
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
        {emptyMessage && (
          <div className="station-map__empty" role="status">
            <span className="station-map__empty-mark" aria-hidden="true" />
            <p>{emptyMessage}</p>
          </div>
        )}
        {mappedCount > 0 && (
          <p className="station-map__instructions">DRAG TO SCAN <span>·</span> WHEEL / PINCH TO ZOOM</p>
        )}
      </div>
    </section>
  );
}

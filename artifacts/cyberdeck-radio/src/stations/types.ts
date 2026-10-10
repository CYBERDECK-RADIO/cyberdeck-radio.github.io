/**
 * The station contract shared by the provider, map, and deck.
 *
 *   radio-browser JSON ──▶ normalizeStations ──▶ Station
 *   Station ──▶ list rows / map markers / deck display
 *
 * Only `id`, `name`, and `streams` are required; every other field is optional
 * so a station with missing metadata still renders.
 */

type Station = {
  id: string;
  name: string;
  countryCode?: string;
  country?: string;
  genres: string[];
  coordinates?: [longitude: number, latitude: number];
  streams: Array<{
    url: string;
    codec?: string;
    bitrate?: number;
  }>;
  homepage?: string;
};

export default Station;

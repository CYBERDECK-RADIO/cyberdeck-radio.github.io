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
  /** Region/state as published by the provider ("Bayern", "New York NY"). */
  state?: string;
  /** City (or place) the broadcast originates from, when the catalog knows it. */
  city?: string;
  genres: string[];
  coordinates?: [longitude: number, latitude: number];
  streams: Array<{
    url: string;
    codec?: string;
    bitrate?: number;
  }>;
  homepage?: string;
  /**
   * Probe used by the background health worker to decide live/offline.
   * radio-browser sets this to its server-side /json/url check; streaming
   * sources (SomaFM) point at the icecast URL that answers with CORS headers.
   */
  checkUrl?: string;
};

export default Station;

import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import worldAtlas from "world-atlas/countries-110m.json";

const topology = worldAtlas as unknown as Topology;

// Bundled Natural Earth boundaries keep the map usable without a tile API key.
export const worldCountries = feature(
  topology,
  topology.objects.countries,
) as GeoJSON.FeatureCollection;

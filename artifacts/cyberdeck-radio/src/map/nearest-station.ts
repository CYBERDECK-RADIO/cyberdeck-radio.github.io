import type Station from "../stations/types";

type Coordinates = readonly [longitude: number, latitude: number];

const EARTH_RADIUS_KM = 6_371;

export function findNearestStation(
  stations: Station[],
  center: Coordinates,
): Station | null {
  if (!isValidCoordinates(center)) return null;

  const [centerLongitude, centerLatitude] = center;
  const centerLatitudeRadians = toRadians(centerLatitude);
  let nearest: Station | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const station of stations) {
    const coordinates = station.coordinates;
    if (!coordinates || !isValidCoordinates(coordinates)) continue;

    const [longitude, latitude] = coordinates;
    const latitudeDelta = toRadians(latitude - centerLatitude);
    const longitudeDelta = toRadians(longitude - centerLongitude);
    const latitudeRadians = toRadians(latitude);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(centerLatitudeRadians) *
        Math.cos(latitudeRadians) *
        Math.sin(longitudeDelta / 2) ** 2;
    const distance = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));

    if (distance < nearestDistance) {
      nearest = station;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function isValidCoordinates(value: readonly number[]): value is Coordinates {
  if (value.length !== 2) return false;
  const [longitude, latitude] = value;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

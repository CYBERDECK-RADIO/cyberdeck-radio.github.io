/**
 * Secure-stream helpers.
 *
 * The app plays over HTTPS only (browsers block `http:` media on an HTTPS
 * page), so a station is only usable when at least one of its streams is an
 * `https:` URL. These pure helpers gate every provider record, the directory,
 * and the map so a channel that cannot be secured never reaches the controller
 * (which would otherwise report "No secure stream is available").
 */

import type Station from "./types";

export function isSecureStreamUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function hasSecureStream(station: Station): boolean {
  return station.streams.some((stream) => isSecureStreamUrl(stream.url));
}

export function secureStreamUrls(station: Station): string[] {
  return station.streams.map((stream) => stream.url).filter(isSecureStreamUrl);
}
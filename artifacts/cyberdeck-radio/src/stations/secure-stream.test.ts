import { describe, expect, it } from "vitest";

import { hasSecureStream, isSecureStreamUrl, secureStreamUrls } from "./secure-stream";
import type Station from "./types";

function station(urls: string[]): Station {
  return { id: "s", name: "S", genres: [], streams: urls.map((url) => ({ url })) };
}

describe("isSecureStreamUrl", () => {
  it("accepts https and rejects http", () => {
    expect(isSecureStreamUrl("https://stream.example/live")).toBe(true);
    expect(isSecureStreamUrl("http://stream.example/live")).toBe(false);
  });

  it("rejects unparseable urls", () => {
    expect(isSecureStreamUrl("not-a-url")).toBe(false);
    expect(isSecureStreamUrl("")).toBe(false);
  });
});

describe("hasSecureStream", () => {
  it("is true when any stream is https", () => {
    expect(hasSecureStream(station(["http://a.example", "https://b.example"]))).toBe(true);
  });

  it("is false when every stream is http", () => {
    expect(hasSecureStream(station(["http://a.example", "http://b.example"]))).toBe(false);
  });

  it("is false with no streams", () => {
    expect(hasSecureStream(station([]))).toBe(false);
  });
});

describe("secureStreamUrls", () => {
  it("returns only the https urls", () => {
    expect(secureStreamUrls(station(["http://a.example", "https://b.example"]))).toEqual([
      "https://b.example",
    ]);
  });
});
import { describe, expect, it } from "vitest";

import {
  buildStationLink,
  parseStationIdFromSearch,
  withStationParam,
} from "./share-link";

describe("parseStationIdFromSearch", () => {
  it("reads the station param from a query string", () => {
    expect(parseStationIdFromSearch("?station=garden:abc")).toBe("garden:abc");
    expect(parseStationIdFromSearch("station=garden:abc")).toBe("garden:abc");
    expect(parseStationIdFromSearch("?q=jazz&station=soma:groove")).toBe("soma:groove");
  });

  it("decodes escaped ids and tolerates padding variants", () => {
    expect(parseStationIdFromSearch("?station=channel%20one")).toBe("channel one");
    expect(parseStationIdFromSearch("?station=channel+one")).toBe("channel one");
  });

  it("returns null when there is no usable id", () => {
    expect(parseStationIdFromSearch("")).toBeNull();
    expect(parseStationIdFromSearch("?q=jazz")).toBeNull();
    expect(parseStationIdFromSearch("?station=")).toBeNull();
    expect(parseStationIdFromSearch("?other=a&station")).toBeNull();
    expect(parseStationIdFromSearch("?station=%E0%A4%A")).toBeNull();
  });
});

describe("withStationParam", () => {
  it("sets the station param and keeps the rest of the query", () => {
    expect(withStationParam("", "garden:abc")).toBe("?station=garden%3Aabc");
    expect(withStationParam("?q=jazz", "garden:abc")).toBe("?q=jazz&station=garden%3Aabc");
    expect(withStationParam("?station=old", "garden:abc")).toBe("?station=garden%3Aabc");
  });

  it("removes the param when there is no station to point at", () => {
    expect(withStationParam("?station=garden:abc", null)).toBe("");
    expect(withStationParam("?station=garden:abc&q=jazz", null)).toBe("?q=jazz");
  });
});

describe("buildStationLink", () => {
  it("appends the station param to the base", () => {
    expect(buildStationLink("garden:abc")).toBe("/?station=garden%3Aabc");
    expect(buildStationLink("garden:abc", "https://atlas.example/")).toBe(
      "https://atlas.example/?station=garden%3Aabc",
    );
  });

  it("joins onto a base that already carries a query", () => {
    expect(buildStationLink("a b", "/radio?x=1")).toBe("/radio?x=1&station=a%20b");
    expect(buildStationLink("a", "/radio?")).toBe("/radio?station=a");
  });
});

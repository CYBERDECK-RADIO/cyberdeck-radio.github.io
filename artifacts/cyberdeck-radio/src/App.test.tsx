// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import App from "./App";

afterEach(cleanup);

describe("App home view", () => {
  it("renders the search, deck, and results region", () => {
    render(<App />);

    expect(screen.getByTestId("input-station-search")).toBeTruthy();
    expect(screen.getByTestId("deck")).toBeTruthy();
    expect(screen.getByTestId("results-region")).toBeTruthy();
  });

  it("does not render the world map", () => {
    render(<App />);

    expect(screen.queryByTestId("station-map")).toBeNull();
  });
});

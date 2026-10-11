// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Router } from "wouter";

import NotFound from "./not-found";

afterEach(cleanup);

describe("NotFound", () => {
  it("renders an on-brand 404 with a link back to the receiver", () => {
    render(
      <Router>
        <NotFound />
      </Router>,
    );

    expect(screen.getByRole("heading", { name: /off the dial/i })).toBeTruthy();
    expect(screen.getByTestId("link-not-found-home").getAttribute("href")).toBe("/");
  });
});

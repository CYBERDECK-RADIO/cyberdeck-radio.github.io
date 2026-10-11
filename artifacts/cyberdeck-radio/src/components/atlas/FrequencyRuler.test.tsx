// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import FrequencyRuler from "./FrequencyRuler";
import { formatFrequency, stationFrequency } from "@/stations/frequency";
import type Station from "@/stations/types";

const stations: Station[] = [
  {
    id: "alpha",
    name: "Alpha Wave",
    genres: [],
    streams: [{ url: "https://stream.example/alpha" }],
  },
  {
    id: "beta",
    name: "Beta Harbour",
    genres: [],
    streams: [{ url: "https://stream.example/beta" }],
  },
];

describe("FrequencyRuler", () => {
  beforeEach(() => cleanup());

  it("reads out the locked station's synthetic carrier", () => {
    render(
      <FrequencyRuler stations={stations} selectedStationId="beta" onTune={() => {}} />,
    );

    expect(screen.getByTestId("text-frequency-readout").textContent).toBe(
      formatFrequency(stationFrequency("beta")),
    );
  });

  it("tunes the nearest carrier when the dial settles", () => {
    const onTune = vi.fn();
    render(<FrequencyRuler stations={stations} selectedStationId={null} onTune={onTune} />);

    const dial = screen.getByTestId("range-frequency-dial");
    fireEvent.change(dial, { target: { value: String(stationFrequency("alpha")) } });

    expect(onTune).toHaveBeenCalledWith("alpha");
  });

  it("previews the needle while dragging without committing", () => {
    const onTune = vi.fn();
    render(<FrequencyRuler stations={stations} selectedStationId="alpha" onTune={onTune} />);

    const dial = screen.getByTestId("range-frequency-dial");
    fireEvent.input(dial, { target: { value: "101.5" } });

    expect(screen.getByTestId("text-frequency-readout").textContent).toBe("101.50");
    expect(onTune).not.toHaveBeenCalled();
  });
});

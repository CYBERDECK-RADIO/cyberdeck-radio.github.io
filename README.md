# Radio Atlas · CyberDeck Radio

> **Global atmospheric tuner.** Spin a full-screen world map to any signal on Earth —
> search or scan **Radio Garden** (~38k channels baked at build time), live **Radio Browser**
> (AIRWAVES), and **SomaFM**, then tune straight into the broadcaster's own stream.

[![Live site](https://img.shields.io/badge/listen-radio%20atlas-FF3C00?style=flat-square)](https://cyberdeck-radio.github.io/)
[![Deploy](https://img.shields.io/github/actions/workflow/status/CYBERDECK-RADIO/cyberdeck-radio.github.io/deploy.yml?label=deploy&style=flat-square)](https://github.com/CYBERDECK-RADIO/cyberdeck-radio.github.io/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-💖%20GitHub-ea4aaa?style=flat-square)](https://github.com/sponsors/CYBERDECK-RADIO)

An atlas-first radio receiver: the world map owns the full canvas, station clusters
pulse over a hand-rolled SVG globe, and a floating "now playing" dossier rides the
signal — while the directory hides in a slide-over drawer, opened only when you mean
it. Pick a pip, hop arrows, or search your way to a station, and the browser connects
**directly to the broadcaster's stream**. No accounts, no proxies, no middleware.

## Features

- **Atlas-first receiver** — pannable, zoomable world map with animated station pips
  and cluster deep dives; pan-settle tunes the nearest signal, deliberate picks fly to it.
- **Three sources** — the CI-baked Radio Garden catalog (~38k channels), live Radio
  Browser search/trending (AIRWAVES), and the SomaFM channel lineup.
- **Faceted search** — country → region → city → genre → codec filters with a unified
  multi-token matcher and a `⌘K`/`/` suggestion palette (Recent / Stations / Countries /
  Cities / Genres / Scan).
- **Now-playing dossier** — per-station accent art, honest health chip (live / offline /
  insecure / unknown), transport + volume + prev/next hop, pin shelf, share links,
  sleep timer, and OS media-key mirroring.
- **Atmospheric modes** — Zen (chrome-free atlas), a screen-saver with its own
  transport and UTC clock, and a decorative WebGL mesh-gradient backdrop
  (Paper Shaders, Apache-2.0) that disables itself without WebGL2 or under
  `prefers-reduced-motion`.
- **HTTPS-first & honest** — HTTP-only and geo-restricted streams are handled openly
  (`SIGNAL LOST`), the spectrum visualizer is labeled `SIMULATED` unless a real Web
  Audio connection exists, and autoplay is never forced.
- **No tracking by default** — analytics are compile-time opt-in (see below).

## Sources & attribution

| Source | Used for |
| --- | --- |
| [Radio Garden](https://radio.garden/) | Default directory + map pins (scraped in CI) |
| [Radio Browser](https://www.radio-browser.info/) | Optional AIRWAVES source (live search) |
| [SomaFM](https://somafm.com/) | Curated channel lineup |
| [Natural Earth](https://www.naturalearthdata.com/) | Country outlines on the map |

Full attribution, known limitations, and troubleshooting live in
[docs/attribution-and-limitations.md](docs/attribution-and-limitations.md).

## Development

pnpm workspace. Node.js 24, TypeScript 5.9.

```sh
pnpm install

# Web app (managed dev server on PORT 8080)
pnpm --filter @workspace/cyberdeck-radio run dev

# Scrape a fresh Radio Garden catalog into public/radio-garden.json
pnpm --filter @workspace/scripts run scrape:radio-garden

# Typecheck + tests + build
pnpm run typecheck
pnpm --filter @workspace/cyberdeck-radio test
pnpm run build
```

### Environment

- `PORT` / `BASE_PATH` — required by the Vite config (the Pages deploy uses `8080` / `/`).
- `VITE_GA_ID` — **optional** Google Analytics 4 measurement ID. When set at build time,
  gtag.js is injected and pageviews are tracked; when unset the app ships **zero**
  analytics or third-party scripts. There is no runtime analytics otherwise.

## How it stays live

A scheduled GitHub Action crawls radio.garden daily (with a per-day cache for ordinary
pushes), gzips the ~10 MB catalog so the app transports ~1 MB, verifies it, and deploys
the static bundle to GitHub Pages. See
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## License & sponsorship

MIT. If Radio Atlas keeps your world in tune, sponsor the project on
[GitHub Sponsors](https://github.com/sponsors/CYBERDECK-RADIO).
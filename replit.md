# CyberDeck Radio

A static radio-discovery app for finding real stations worldwide, presented as the **World Broadcast Atlas**: a full-bleed, pannable world map where every station emits an animated radio-wave pulse, with glassy search, directory, and deck panels floating over it. Pulling the map to a region "tunes" the nearest signal.

## Run & Operate

- `pnpm --filter @workspace/cyberdeck-radio run dev` — run the web app through its managed workflow
- `pnpm --filter @workspace/cyberdeck-radio run typecheck` — typecheck the web app
- `pnpm --filter @workspace/cyberdeck-radio test` — run station-provider tests
- `pnpm --filter @workspace/scripts run scrape:radio-garden` — crawl radio.garden into `public/radio-garden.json` (env: `RG_PLACES_LIMIT`, `RG_CONCURRENCY`, `RG_RESOLVE_STREAMS`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cyberdeck-radio/src/App.tsx` — World Broadcast Atlas shell: full-bleed map with overlay topbar/search/directory/deck rails, search states, and selected-station UI
- `artifacts/cyberdeck-radio/src/components/StationMap.tsx` — MapLibre world map with graticule, animated station pulses, marker/nearest-center selection, and an `atlas` variant that fills the viewport
- `artifacts/cyberdeck-radio/src/components/StationMapFallback.tsx` — dependency-free SVG world used when WebGL is unavailable
- `artifacts/cyberdeck-radio/src/skin/` — Winamp/JetAudio theme selection persisted to localStorage and applied via `data-skin` tokens
- `artifacts/cyberdeck-radio/src/stations/types.ts` — app-owned station data contract (optional `checkUrl` for the health probe)
- `artifacts/cyberdeck-radio/src/stations/radio-browser.ts` — Radio Browser API adapter and response normalization (search + trending-by-votes + per-station `checkUrl`)
- `artifacts/cyberdeck-radio/src/stations/somafm.ts` — SomaFM channel catalog adapter (`channels.json`, 10-min cache)
- `artifacts/cyberdeck-radio/src/stations/radio-garden.ts` — Radio Garden adapter over the CI-scraped `public/radio-garden.json` (same-origin, client-side search, 10-min cache)
- `artifacts/cyberdeck-radio/src/stations/sources.ts` — channel-source registry (`AIRWAVES` global/geotagged, `SOMA FM` internet-only, `RADIO GARDEN` global/geotagged)
- `scripts/src/scrape-radio-garden.ts` — the crawler: places via the bulk `places-core-columnar`/`places-details-columnar` endpoints (2 requests) → per-place channels → writes the baked catalog; stream resolution is opt-in
- `artifacts/cyberdeck-radio/src/stations/stream-health-logic.ts` — shared probe classification shared with the worker and its tests
- `artifacts/cyberdeck-radio/src/stations/stream-health.worker.ts` — background Web Worker polling each station's `checkUrl` (concurrency 3, one retry, 5-min recheck, 15-s sweep) and posting `health` statuses
- `artifacts/cyberdeck-radio/src/stations/stream-health.ts` — client store + `useStationHealth()` (batched 90 ms notifications) over `useSyncExternalStore`
- `artifacts/cyberdeck-radio/src/audio/audio-controller.ts` — single playback state machine: HTTPS-only candidate filtering, one-pass stream fallback, autoplay-rejection recovery, volume clamping
- `artifacts/cyberdeck-radio/src/audio/media-session.ts` — mirrors the tuned station and playback state to the OS lock screen / hardware media keys
- `artifacts/cyberdeck-radio/src/preferences/` — lightweight user preferences (volume, visualizer style) persisted to localStorage
- `artifacts/cyberdeck-radio/src/map/nearest-station.ts` — geographic nearest-station selection
- `artifacts/cyberdeck-radio/src/map/world-data.ts` — bundled Natural Earth country boundaries
- `artifacts/cyberdeck-radio/src/index.css` — app theme and responsive layout
- `artifacts/cyberdeck-radio/src/stations/radio-browser.test.ts` — adapter tests
- `artifacts/cyberdeck-radio/src/map/nearest-station.test.ts` — nearest-station tests

## Architecture decisions

- CyberDeck Radio is a static, browser-only app; its current station search calls the public Radio Browser API directly.
- The World Broadcast Atlas is map-first: the map is the full-viewport hero and the search, directory, and deck are translucent overlay rails. On narrow screens the rails stack into a scrollable sheet over the map.
- Stations with coordinates emit an animated pulse; pulling the map (pan/zoom) tunes the nearest signal, and selecting a station flies the map to it. Pulses are disabled under `prefers-reduced-motion`.
- The app ships two switchable interface skins (Winamp, JetAudio) driven by `--skin-*` CSS custom properties on `data-skin`; both retheme the whole atlas.
- Keep provider JSON behind the station adapter; UI code consumes only the app-owned `Station` type.
- MapLibre renders bundled Natural Earth boundaries, avoiding external tile requests and API-key requirements.
- The map selects the station closest to its center after search results load or map movement settles; focus changes do not start playback.
- Channels are surfaced through a source registry (`sources.ts`); each source advertises hint/placeholder copy, whether it is geotagged (can pin the atlas), and how to list/search. AIRWAVES searches/traffic-sorts Radio Browser; SOMA FM caches `channels.json` and filters client-side; RADIO GARDEN serves a pre-scraped catalog and filters client-side.
- Radio Garden's JSON API is CORS-locked to its own origin and gated by Cloudflare, so the browser cannot call it. A scheduled GitHub Action crawls it in Node (browser User-Agent, no CORS) and bakes `public/radio-garden.json` before the Pages build. The crawler collects every place in two bulk requests (`places-core-columnar` + `places-details-columnar`, the same endpoints the official client merges by index) and saves each channel's stable HTTPS `channel.mp3` listen URL as its stream, so it does not resolve ~38k redirects (that is opt-in via `RG_RESOLVE_STREAMS=1`); a full crawl takes under a minute locally. The catalog is gitignored and cached per-day in CI so ordinary pushes skip the crawl.
- The atlas opens by loading the top-voted geotagged Radio Browser stations ("live signals worldwide"); a manual search replaces them. Non-geotagged catalogs (SomaFM) never pin the map and show a "no usable coordinates" empty state instead.
- A background Worker ("stream health") probes every listed station's `checkUrl` off the UI thread and reports live/offline/checking/unknown. Records carry the live/offline state via green/red dots in the directory, colored + haloed (and pulse-excluding) map pins, an offline icon in each list row, and a health chip on the deck.
- Radio Browser probes reuse its server-side stream validation via `GET /json/url/{uuid}` (CORS-safelisted); SomaFM probes the lightweight `https://somafm.com/{id}.pls` playlist because icecast returns 403 to browser fetches. The probe never reads a stream body: it classifies first, then cancels the response body so API JSON is still readable.
- The directory is Apple-Watch-dense: rows show an index, health dot, and name at rest; country/genres/codec expand on hover/focus/selection. Touch and `(hover: none)` environments always show the details.
- One `AudioController` owns one audio element and is the single source of playback truth; the deck renders controller state and never guesses from button clicks. Playback starts only on an explicit play action — selecting a station never auto-plays.
- Stream candidates are filtered to HTTPS on an HTTPS page and tried in order with at most one pass; a rejected `play()` (autoplay policy) is a recoverable error, not a silent success.
- Playback state and the tuned station are mirrored to the Media Session API (when available) so lock-screen / hardware media keys control the same single `AudioController`; the integration no-ops where the API is missing.
- Volume and visualizer style (spectrum or VU) are persisted in one small localStorage blob; the visualizer stays honestly labeled SIMULATED until a tested Web Audio analyser is connected.
- Do not proxy or downgrade stream URLs. Playback work must preserve HTTPS-first behavior and continue direct audio if Web Audio processing is blocked.
- Do not add a runtime backend, database, account system, or AI model. The one sanctioned crawler is the Radio Garden scraper, which runs only at build time in CI and emits a static file — the app stays browser-only and same-origin.

## Product

Listeners can search the live station directory by station name, country, or genre — or browse the SomaFM lineup via a source switch — and watch matching stations light up the World Broadcast Atlas with radio-wave pulses and per-channel live/offline health, pan the globe to tune the nearest signal, and select a station to inspect its metadata. The directory and retro deck float as glass panels over the map (a scrollable sheet on mobile). A selected station can be played over its HTTPS stream with play/pause/stop and volume controls; failed streams surface an explicit error and can be retried without reloading.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Radio Browser records can omit country, genres, coordinates, bitrate, or resolved stream URLs; treat those fields as optional.
- Stations without valid coordinates remain searchable but cannot appear on the map or be selected as the map-center nearest station.
- A directory result is not a guarantee that a stream is currently reachable. Keep provider errors distinct from a successful search with no results.
- `map.isStyleLoaded()` stays `false` forever when a GeoJSON source is waiting on its first `setData`; gate pin updates on a `styleReady` flag set in the map `load` handler instead or the pins deadlock.
- MapLibre pin data must include the selected/health flags as feature properties and be pushed through `source.setData` on every change for paint expressions to re-evaluate.
- Vite emits workers as IIFE by default; module workers must set `worker: { format: 'es' }` in `vite.config.ts` or `new Worker(..., { type: "module" })` fails to parse.
- Never cancel `response.body` before reading a JSON health probe — it consumes the body and turns valid `{ok:true}` responses into "offline". Classify first, cancel after.
- icecast-style mounts (e.g. `ice2.somafm.com/…-128-mp3`) can return 403 to browser `fetch`; probe reachability with the channel's `.pls` playlist URL instead.
- radio.garden returns a Cloudflare `403` challenge to plain requests and only sets `Access-Control-Allow-Origin` for its own origin; the crawler must send a browser User-Agent (and never runs in the browser). The generated `public/radio-garden.json` is gitignored, so the adapter treats a missing file (`404`) as an empty catalog rather than an error — the RADIO GARDEN source is simply empty until CI bakes it.
- The Radio Garden catalog is ~10 MB, so the deploy workflow also publishes `public/radio-garden.json.gz`; the adapter fetches the gzip copy and decompresses via `DecompressionStream`, transparently falling back to the plain JSON file when it is missing, undecodable, or `DecompressionStream` is unavailable.
- Follow radio.garden's `channel.mp3` redirect with `redirect: "manual"` and read the `Location` header; the resolved direct URL is only kept when it is `https` (the app's HTTPS-only playback rule), with the `https` `channel.mp3` listen URL retained as a playable fallback.
- The app's Vite workflow supplies `PORT` and `BASE_PATH`; do not start the artifact with a manually configured duplicate workflow.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

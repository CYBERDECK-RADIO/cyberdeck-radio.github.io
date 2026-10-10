# CyberDeck Radio

A static radio-discovery app for finding real stations worldwide, with a retro receiver interface. The first vertical slice provides live station search and station selection.

## Run & Operate

- `pnpm --filter @workspace/cyberdeck-radio run dev` — run the web app through its managed workflow
- `pnpm --filter @workspace/cyberdeck-radio run typecheck` — typecheck the web app
- `pnpm --filter @workspace/cyberdeck-radio test` — run station-provider tests
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

- `artifacts/cyberdeck-radio/src/App.tsx` — station search, search states, and selected-station UI
- `artifacts/cyberdeck-radio/src/components/StationMap.tsx` — interactive world map, station markers, and focus behavior
- `artifacts/cyberdeck-radio/src/stations/types.ts` — app-owned station data contract
- `artifacts/cyberdeck-radio/src/stations/radio-browser.ts` — Radio Browser API adapter and response normalization
- `artifacts/cyberdeck-radio/src/map/nearest-station.ts` — geographic nearest-station selection
- `artifacts/cyberdeck-radio/src/map/world-data.ts` — bundled Natural Earth country boundaries
- `artifacts/cyberdeck-radio/src/index.css` — app theme and responsive layout
- `artifacts/cyberdeck-radio/src/stations/radio-browser.test.ts` — adapter tests
- `artifacts/cyberdeck-radio/src/map/nearest-station.test.ts` — nearest-station tests

## Architecture decisions

- CyberDeck Radio is a static, browser-only app; its current station search calls the public Radio Browser API directly.
- Keep provider JSON behind the station adapter; UI code consumes only the app-owned `Station` type.
- MapLibre renders bundled Natural Earth boundaries, avoiding external tile requests and API-key requirements.
- The map selects the station closest to its center after search results load or map movement settles; focus changes do not start playback.
- Do not proxy or downgrade stream URLs. Playback work must preserve HTTPS-first behavior and continue direct audio if Web Audio processing is blocked.
- Do not add a backend, database, account system, AI model, or scheduled crawler unless a later product decision requires it.

## Product

Listeners can search the live station directory by station name, country, or genre, explore station coordinates on a pannable and zoomable world map, and select a station to inspect its metadata. The current slice does not yet play audio.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Radio Browser records can omit country, genres, coordinates, bitrate, or resolved stream URLs; treat those fields as optional.
- Stations without valid coordinates remain searchable but cannot appear on the map or be selected as the map-center nearest station.
- A directory result is not a guarantee that a stream is currently reachable. Keep provider errors distinct from a successful search with no results.
- The app's Vite workflow supplies `PORT` and `BASE_PATH`; do not start the artifact with a manually configured duplicate workflow.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

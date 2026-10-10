# CyberDeck Radio — Implementation Plan

**Source:** Product Requirement Document, Project Codename CyberDeck Radio, v1.0.0-PROD  
**Planning objective:** Deliver a dependable, static-hosted radio discovery and listening experience first; add higher-risk capabilities only after the core listening loop is proven.

## Product outcome

A listener can open CyberDeck Radio, find a real station by name, genre, or country, discover stations geographically, start playback with an HTTPS stream, and see the selected station reflected in a retro-inspired audio deck. The app remains a static client deployable to GitHub Pages, with no required application server, account, or API key.

## Recommended first release

### P0 — MVP: Discover and listen

- Responsive single-page interface with a map/list split and a compact retro deck.
- Search and filters for station name, country, and genre.
- Station results from Radio Browser, with graceful loading, empty, and provider-error states.
- MapLibre map with station markers for results that have coordinates; synchronized selection between map and list.
- HTML audio playback using an HTTPS stream only; show station name, country, codec/bitrate when supplied, and playing/error state.
- Per-station URL fallback when available; manual retry and clear feedback when streams fail.
- Basic volume control, mute, and stop/play controls.
- Persist only lightweight user preferences (e.g. volume and selected visual mode) locally.
- Static build and deploy configuration for GitHub Pages, including correct base path handling.

### P1 — Make the listening experience feel like CyberDeck

- Expand the deck into a JetAudio-inspired rack: VFD-style station display, animated cassette reels, and a synthetic spectrum/VU visualization.
- Add a 10-band equalizer only when the audio source can be routed through Web Audio without breaking playback. If CORS prevents processing, keep direct audio playback and use a clearly simulated visualizer.
- Add a day/night map treatment and a tuning-style control only if user testing shows they help discovery.
- Add Media Session metadata and lock-screen controls where supported.

### P2 — Advanced capabilities, gated by evidence

- Optional HLS playback through a lazily loaded HLS library after the MVP's supported-stream mix is measured.
- On-device semantic search only if ordinary search and filters prove insufficient; download model assets on demand and explain their size before loading.
- Client-side speech DJ announcements behind an explicit opt-in and a mute/disable control.
- GitHub Actions station refresh/probing only after defining source terms, retention policy, rate limits, and a reproducible dataset format.
- User-provided Cloudflare Worker relay as an optional advanced setup, not a default dependency.

## Deliberately out of scope for MVP

- 3D globe, spatial audio, synthetic atmospheric soundscapes, and automatic neighbor-station switching.
- Winamp `.wsz` parsing and skin archive browsing.
- Full JetAudio skin-pack compatibility or pixel-perfect emulation.
- Transformers.js model, AI DJ, automatic stream restoration, and generated station artwork cascade.
- Proxying third-party streams, bypassing geo-restrictions, or promising that every public station is reachable.
- Autonomous culling/committing of a large global station dataset.

These are substantial independent workstreams. Keeping them out of the first release reduces browser compatibility, content-rights, performance, and deployment risk while preserving the distinctive retro visual direction.

## Phased delivery

### Phase 0 — Validate assumptions and data access

1. Probe the Radio Browser API from the deployed-origin context and confirm the selected endpoints, response fields, CORS behavior, and practical rate limits.
2. Test a small sample of HTTPS stations across MP3/AAC and, if present, HLS; record which play in current desktop Chrome, Firefox, and Safari/iOS.
3. Select a map style and tile source with terms suitable for the intended public site; verify no secret token or paid key is required.
4. Decide whether the first version queries Radio Browser at runtime or ships a small, periodically refreshed static snapshot. Prefer runtime queries for the quickest MVP if CORS and availability are acceptable; otherwise generate a small static seed file.

**Exit gate:** A browser-only proof of concept can search stations, render a map, and play at least one HTTPS station without a server-side proxy.

### Phase 1 — Build the core listening loop

1. Set up the static frontend, routing/base path, lint/type checks, and GitHub Pages deployment workflow.
2. Implement a provider adapter that normalizes external records into a small internal station model and handles provider errors/timeouts.
3. Build search, filters, list results, and map/list selection synchronization.
4. Implement the audio controller as a single source of truth: current station, stream candidate index, play/pause, volume, loading, and error state.
5. Filter insecure HTTP URLs on HTTPS pages; try known HTTPS candidates in order. Do not silently proxy or downgrade security.
6. Add keyboard-accessible controls, responsive layouts, and empty/error/loading states.

**Exit gate:** A new user can search, select a station, hear it, switch stations, and recover from a failed stream without reloading the page.

### Phase 2 — Add the signature retro deck

1. Define a small theme-token system for CRT, phosphor, and rack colors.
2. Add station metadata display and playback controls to the deck.
3. Add a canvas/CSS visualizer that can operate in both real-analyser and simulated modes; label the simulated mode honestly.
4. Test the Web Audio path against CORS-blocked streams and automatically fall back to direct `<audio>` playback.
5. Add Media Session metadata and tune mobile behavior based on actual device testing.

**Exit gate:** The deck remains usable on desktop and mobile, and CORS/unsupported audio processing never turns a playable stream into silence.

### Phase 3 — Reliability and public launch

1. Add automated build checks and a smoke test for the static output and GitHub Pages base path.
2. Add lightweight client-side telemetry only if privacy policy and consent requirements are decided; otherwise rely on error states and manual test fixtures.
3. Add an optional offline shell/PWA only after caching behavior is tested; never imply that live streams work offline.
4. Document data-source attribution, limitations, troubleshooting, and how to report stale or broken stations.
5. Run the release checklist below and publish.

**Exit gate:** Clean install/build, all release checks pass, and the hosted page has no required server, secret, or accidental insecure stream dependency.

### Phase 4 — Decide which advanced work earns its cost

Use observed usage and a prioritized backlog to select one extension at a time. Suggested order: HLS support if common in chosen stations; a small static station index if API availability is weak; optional skins if users ask for them; semantic search only if query quality is a clear gap; then automated data reconciliation. Each extension gets its own compatibility and rights review.

## Suggested technical boundaries

- **UI:** React + TypeScript + Vite, with CSS variables and component-level styling. Keep the first bundle small; lazy-load map and optional media modules where practical.
- **Map:** MapLibre GL JS; begin in a standard 2D projection. Treat globe projection as an enhancement, not a release dependency.
- **Station data:** `StationProvider` adapter converts provider responses to an internal `Station` type. Keep provider-specific fields out of UI components.
- **Playback:** One `AudioController` owns one audio element and exposes state/events to the UI. Keep stream probing conservative and client-side; avoid aggressive polling.
- **Visualization:** Separate `AudioVisualizer` from playback. It should support `analyser` and `simulated` modes so CORS restrictions do not block listening.
- **Persistence:** `localStorage` for small preferences only; no account or database in the MVP.
- **Deployment:** Static assets only. Verify the GitHub Pages project path/base URL; no runtime secrets in browser code.

## Initial data model

```ts
type Station = {
  id: string;
  name: string;
  countryCode?: string;
  country?: string;
  genres: string[];
  coordinates?: [longitude: number, latitude: number];
  streams: Array<{
    url: string;
    codec?: string;
    bitrate?: number;
  }>;
  homepage?: string;
};
```

Keep health scores and CORS verification out of the public model until a real, reproducible probe pipeline exists. A browser cannot reliably certify another origin's CORS behavior without actually attempting the relevant operation.

## Acceptance criteria for MVP

- Search by station name returns results or a clear no-results message; provider failure is distinguishable from no results.
- Country/genre filters work with missing metadata and can be cleared.
- Selecting a result updates the selected marker and deck; selecting a map marker updates the selected result.
- No insecure HTTP stream is attempted from the HTTPS site.
- Play, pause, stop, volume, stream failure, retry, and station switching have visible and accessible states.
- If a primary stream fails and a backup exists, the player tries the backup once and reports the result; no unbounded retry loop.
- If Web Audio processing is blocked, direct playback continues and the UI indicates simulated visualization.
- The app works at narrow mobile and desktop widths, supports keyboard interaction, and respects reduced-motion preferences.
- A production build succeeds and the GitHub Pages URL loads assets correctly from its repository path.
- No API key, credential, or secret is required in client code.

## Key risks and mitigations

| Risk | Why it matters | MVP mitigation |
|---|---|---|
| Public streams are unreliable or geo-restricted | Directory availability does not guarantee playback | HTTPS-first selection, one bounded fallback, clear error state, no universal-availability promise |
| CORS varies by station | Web Audio processing may fail although audio playback works | Direct audio fallback; visualizer becomes simulated |
| Map tiles have usage terms or keys | “No API key” depends on chosen tile provider, not MapLibre itself | Validate tile source and terms before committing to it; avoid embedding private keys |
| Runtime directory API changes or rate-limits | Search may fail independently of the app | Isolate provider behind adapter; add timeout/error states; consider static snapshot only if needed |
| Static host limits background work | GitHub Pages cannot run a backend or scheduled job itself | Keep runtime serverless; put scheduled reconciliation in GitHub Actions only as a later, explicit repo workflow |
| AI/model loading hurts first-use performance | A ~23 MB model is a large cost for a radio player | Defer model; lazy-load, cache, disclose, and make standard search fully usable |
| Scope combines several products | Map, skin engine, DSP, AI, crawler, and proxy each need separate testing | Ship in phases with explicit exit gates; do not make advanced features prerequisites |

## Release checklist

- [ ] Confirm data and map provider terms, attribution, and request behavior.
- [ ] Verify HTTPS-only stream selection and fallback behavior.
- [ ] Test direct playback and CORS-blocked visualization fallback.
- [ ] Test Chrome, Firefox, Safari desktop, and at least one iOS/Android device.
- [ ] Verify keyboard navigation, visible focus, contrast, and reduced motion.
- [ ] Verify deployment from a GitHub Pages repository subpath.
- [ ] Confirm no secret or private key is shipped to the browser.
- [ ] Publish known limitations and a station issue/report path.

## Decisions to make before implementation

1. **Data delivery:** Runtime Radio Browser queries, or a small generated static dataset?
2. **Initial experience:** Map-first, or searchable station list with the map as a companion? (Recommendation: list/search-first on mobile, synchronized map on larger screens.)
3. **Visual target:** A custom JetAudio-inspired deck for the first release, or a simpler retro control panel before building the full rack?
4. **Public scope:** Is this a personal/demo project, or a public open-source service? Public launch changes attribution, abuse/rate-limit, accessibility, and maintenance expectations.

## Recommended starting point

Start with Phase 0 and a small vertical slice: search one provider, show a station list and map marker, play an HTTPS stream, and display the selected station in a retro deck. This validates the highest-risk assumptions before investing in skin engines, AI, or automated global data maintenance.

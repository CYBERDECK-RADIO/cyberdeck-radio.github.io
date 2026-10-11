# Attribution, limitations, and troubleshooting

CyberDeck Radio is a static, client-only receiver. This page records where its
data comes from, what it deliberately does not do, and how to work around the
streams that browsers refuse to play.

## Source attribution

| Source | Used for | Link |
| --- | --- | --- |
| radio.garden | The station directory and map pins (baked at build time) | https://radio.garden/ |
| radio-browser.info | Optional AIRWAVES source: live directory search | https://www.radio-browser.info/ |
| Natural Earth | Country outlines drawn on the receiver map | https://www.naturalearthdata.com/ |
| Paper Shaders | Decorative WebGL mesh-gradient backdrop (Apache-2.0; attribution not required, credited here) | https://shaders.paper.design/ |

The default directory ships with the app. radio.garden's JSON API is CORS-locked
to its own origin, so a scheduled GitHub Action crawls it in Node and bakes every
place and channel (~38k, with coordinates and the station's stable HTTPS listen
URL) into `public/radio-garden.json`, also published gzipped. The AIRWAVES source
still queries the public radio-browser.info API live
(`https://de1.api.radio-browser.info`), and the footer credits whichever source
is active. CyberDeck Radio does not host, proxy, or re-broadcast any audio;
playback connects the browser directly to the station's own stream URL — for the
baked catalog that is radio.garden's `channel.mp3` listen endpoint, which
redirects to the broadcaster's stream. The map itself is hand-rolled SVG over the
bundled Natural Earth outlines; no tile server or API key is required. A
decorative WebGL backdrop (Paper Shaders, Apache-2.0) renders a themed
mesh-gradient sky behind the map — purely atmospheric, with no bearing on
search, selection, or playback.

## Known limitations

- **HTTP-only streams are skipped on the HTTPS site.** A page served over HTTPS
  cannot play an `http://` stream (browser mixed-content blocking). The player
  filters to `https://` candidates and reports a signal error when a station has
  none. This is intentional and is not worked around with a public proxy.
- **Geo-restricted streams may fail.** Some broadcasters only serve certain
  regions. The browser receives a network error and the deck shows `SIGNAL LOST`.
- **The visualizer is simulated.** Live spectrum analysis needs the Web Audio
  API to read the stream, which requires CORS permission from the station's
  server. Most public streams do not grant it, so the deck shows a clearly
  labeled `SIMULATED` spectrum. An `analyser` mode exists but is only selected
  when a working Web Audio connection is actually established.
- **Playback needs an explicit action.** Browsers block autoplay with sound, so
  selecting a station never starts audio — only the play control does. A blocked
  autoplay attempt becomes a recoverable error, not a silent failure.
- **No equalizer, no offline mode, no accounts.** These are out of scope for the
  MVP and are not stubbed behind hidden flags.

## Troubleshooting

- **No sound after pressing play.** Check the volume slider and the device
  output. If the deck shows `SIGNAL LOST`, the station's stream is unreachable
  from your network — try another result.
- **A station never plays but others do.** It is likely HTTP-only or
  geo-restricted (see above). Pick a different station.
- **The spectrum never moves with the music.** Expected: it is simulated. See
  "The visualizer is simulated" above.
- **The map falls back to a flat list only if it cannot render.** The world is
  plain SVG; the only WebGL piece is the decorative backdrop, which silently
  disables itself when WebGL2 is unavailable and freezes to a static frame
  under `prefers-reduced-motion`. Search, selection, and playback keep
  working either way.

## Privacy and scope confirmation

- **No telemetry or analytics.** The app ships no analytics, tracking, or
  third-party scripts. Every map path, the station catalog, and the SomaFM
  lineup ship in the bundle or as same-origin static files; the only live
  network calls are the stream audio itself and the optional AIRWAVES source's
  radio-browser.info requests.
- **No PWA or service worker.** There is no `manifest`, no service worker, and
  no install prompt.
- **No offline-stream claims.** Playback always requires a live network
  connection to the station.

# Travel guide

Phone-style trip guides and a public trip planner, served with GitHub Pages.

## Trip Planner (`planner/`)

Pick a city, the number of days and who's coming; get a day-by-day plan for walking and public transport, with maps, lunch stops, rainy-day swaps and day trips. No account, no cookies, no tracking; works offline after the first visit. The whole plan lives in the link, so plans can be shared.

- **Cities:** Barcelona (reviewed), Paris, Rome, Madrid, Milan, Tokyo, New York, New Delhi (unreviewed drafts)
- **Stack:** plain HTML, CSS and JavaScript modules; no build step, no backend
- **Map:** Leaflet (self-hosted) with OpenStreetMap tiles
- **Font:** Overpass (self-hosted, SIL OFL)

### Run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/planner/
```

### Folder layout

```text
planner/
  index.html  styles.css  app.js     app shell and screens
  engine.js                          turns a city pack + trip inputs into a plan (pure, deterministic)
  sw.js  manifest.webmanifest        offline and install
  cities/index.json                  city list (generated)
  cities/<city>.json                 one pack per city
  legal/                             Impressum, Datenschutz, About (templates: fill before launch)
  vendor/leaflet/  fonts/  icons/
schema/city.schema.json              what a city pack must contain
tools/build-index.mjs                rebuild cities/index.json after editing packs
tools/validate.mjs                   schema, data and engine checks (runs in GitHub Actions)
tools/verify-coords.mjs              compare a city's pins with OpenStreetMap (run on your computer)
```

### Add or edit a city

1. Copy a pack in `planner/cities/`, keep `"status": "draft"` until a person has checked it.
2. `node tools/build-index.mjs`
3. `node tools/validate.mjs <city-id>` (must show 0 errors)
4. `node tools/verify-coords.mjs <city-id>` and fix pins it flags
5. After a human review, set `"status": "reviewed"` and `"reviewed": "YYYY-MM"`.

### Before going public

- Fill in `planner/legal/impressum.html` and `datenschutz.html`, then have them checked
- Remove `<meta name="robots" content="noindex, nofollow">` from `planner/index.html`
- Review the draft city packs

## Trip guides

- `barcelona-2026/`: 6 city days + 4 regional day trips (Montserrat, Girona, Tarragona, Tossa de Mar), 19–28 Oct 2026
  - `index.html`: web version (for GitHub Pages)
  - `barcelona-standalone.html`: standalone file for Android

## Licences

- Code (`planner/*.js`, `planner/*.html`, `planner/*.css`, `tools/`, `schema/`): MIT, see `LICENSE`
- City packs and guide texts: all rights reserved until a content licence is chosen
- Leaflet: BSD 2-Clause (`planner/vendor/leaflet/LICENSE`); Overpass font: SIL OFL 1.1 (`planner/fonts/OFL-overpass.txt`)
- Map data © OpenStreetMap contributors (ODbL)

## Stuttgart (25–26 Oct 2026)
- `stuttgart-2026/index.html`: 2-day family guide with a rated map. Pages: https://vipinmohan11.github.io/travel-guide/stuttgart-2026/

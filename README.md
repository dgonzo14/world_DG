# DG Atlas

An interactive 3D globe of every country I've visited, plus the shortest round trip from St. Louis that touches all of them.

**Live:** https://dgonzo14.github.io/world_DG/

Every number on the page is computed in the browser from one GeoJSON file and a list of ISO-3 country codes. Nothing is hard-coded, so adding a trip is a one-line change to `src/data/visitedCountries.ts`.

## What's interesting in here

| Module | What it does |
|---|---|
| [`src/geo/sphere.ts`](src/geo/sphere.ts) | Spherical geometry from scratch: haversine distance, polygon area as a line integral on the sphere (Chamberlain & Duquette 2007), and area-weighted centroids from a signed 3D triangle fan. |
| [`src/geo/route.ts`](src/geo/route.ts) | Travelling-salesman route: nearest-neighbour construction, then 2-opt local search until no two-edge swap improves the loop. It cuts the greedy tour by about 19%. |
| [`src/geo/atlas.ts`](src/geo/atlas.ts) | Turns raw Natural Earth features into a typed model: code resolution with fallbacks, population and land share, continent tallies, extremes, route stops, and timing diagnostics. |
| [`src/components/GlobeView.tsx`](src/components/GlobeView.tsx) | three.js via react-globe.gl: extruded countries, animated great-circle arcs, pulse rings, camera fly-to. |
| [`src/hooks/useHashSelection.ts`](src/hooks/useHashSelection.ts) | Selection lives in the URL (`#/country/JPN`) through `useSyncExternalStore`, so views are shareable and the back button works. |

The **Under the hood** tab on the site shows these modules with live metrics from the current page load.

### A bug the rewrite fixed

Natural Earth gives France, Norway, Kosovo, N. Cyprus and Somaliland an `iso_a3` of `"-99"`. The old helper returned the first non-empty field, got `-99`, rejected it, and gave up. Adding `FRA` would have silently done nothing. Codes now fall through `iso_a3 → adm0_a3 → …` until one is valid, and any visited code without a matching polygon is reported. Both behaviours are covered by tests.

## Features

- Click, search (English or Spanish, accent-insensitive) or step (`←` / `→`) through countries
- **Fly the route** (`T`): a guided tour along the optimized loop, with pause, skip and progress
- Stats: share of world population and land area, continent coverage, hemispheres, extremes, most distant pair
- Keyboard shortcuts: `/` search, `←` `→` step, `T` tour, `Esc` close
- Honors `prefers-reduced-motion`, and falls back to the list when WebGL is unavailable
- Code-split: the UI shell loads first and three.js streams in after it

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # type-check + lint + tests
npm run build
```

Stack: React 19, TypeScript (strict), Vite, three.js / react-globe.gl, Vitest, ESLint (typescript-eslint).

## Tests

`npm test` runs 36 Vitest cases:

- **Geometry:** closed-form areas for lat/lng boxes and a sphere octant, winding invariance, holes, antimeridian centroids, and resistance to uneven vertex density.
- **Routing:** valid permutations, a fixed start, never worse than greedy, and a verified 2-opt local optimum on seeded random inputs.
- **Integration:** the real dataset (every visited code resolves; Earth's land area and known country areas come out in the right range).

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`. Type-check, lint and tests must pass before Vite builds and publishes `dist/` to GitHub Pages.

## Data

`public/data/countries.geojson` holds Natural Earth 1:110m admin-0 countries (via Visionscarto World Atlas), with Western Sahara kept separate from Morocco. Population figures are Natural Earth estimates.

# My Travel Globe

Single-page React travel site built with Vite and `react-globe.gl`.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Build the production bundle with:

```powershell
npm.cmd run build
```

## Data notes

- Country polygons are stored at `public/data/countries.geojson`.
- The current file is the lower-resolution Natural Earth `110m` country GeoJSON, which keeps the globe responsive while preserving country boundaries and ISO metadata.
- Visited countries live in `src/data/visitedCountries.js` as ISO-3 codes so you can expand the list without touching the UI.

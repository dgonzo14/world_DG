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

## Deploy to GitHub Pages

This Vite app is configured for the project page URL:

```text
https://dgonzo14.github.io/world_DG/
```

Push to `main`, then in GitHub go to **Settings > Pages** and set **Source** to
**GitHub Actions**. The workflow in `.github/workflows/deploy.yml` builds the
app and publishes the generated `dist` folder.

## Data notes

- Country polygons are stored at `public/data/countries.geojson`.
- The current file is the lower-resolution Visionscarto World Atlas `110m` countries GeoJSON, derived from Natural Earth and using a Morocco / Western Sahara split that keeps Western Sahara separate from Morocco.
- Visited countries live in `src/data/visitedCountries.js` as ISO-3 codes so you can expand the list without touching the UI.

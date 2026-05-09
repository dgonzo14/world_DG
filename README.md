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
- The current file is the lower-resolution Natural Earth `110m` country GeoJSON, which keeps the globe responsive while preserving country boundaries and ISO metadata.
- Visited countries live in `src/data/visitedCountries.js` as ISO-3 codes so you can expand the list without touching the UI.

/**
 * data/countries.geojson → public/data/countries.topo.json
 *
 *   npm run build:topology
 *
 * TopoJSON stores each shared border once and quantizes coordinates to an
 * integer grid, and we keep only the properties the app reads. Together that
 * shrinks the download several-fold without visibly changing the map.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { topology } from 'topojson-server'
import type { FeatureCollection } from 'geojson'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'data', 'countries.geojson')
const OUT = join(ROOT, 'public', 'data', 'countries.topo.json')

/** Everything src/geo/atlas.ts reads. */
const KEEP = ['iso_a3', 'adm0_a3', 'iso_a2', 'wb_a2', 'name_long', 'name', 'name_es', 'continent', 'subregion', 'pop_est']

/** ~0.004° grid (≈ 400 m at the equator): far below what the 1:110m source resolves. */
const QUANTIZATION = 1e5

const source = JSON.parse(readFileSync(SRC, 'utf8')) as FeatureCollection
const slim: FeatureCollection = {
  type: 'FeatureCollection',
  features: source.features.map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: Object.fromEntries(KEEP.filter((k) => f.properties?.[k] != null).map((k) => [k, f.properties![k]])),
  })),
}

writeFileSync(OUT, JSON.stringify(topology({ countries: slim }, QUANTIZATION)))
const kb = (file: string) => (statSync(file).size / 1024).toFixed(0)
console.log(`Wrote ${OUT}\n  ${slim.features.length} countries · ${kb(SRC)} KB → ${kb(OUT)} KB`)

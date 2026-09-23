import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import visitedCountries from '../data/visitedCountries'
import { HOME } from '../data/home'
import { buildAtlas, featureCode, featureIso2, type FeatureCollection } from './atlas'
import { haversineKm } from './sphere'
import { decodeCountries } from './topology'

// Integration tests run against the real dataset that ships with the site (the
// TopoJSON), cross-checked against the full-precision GeoJSON it's built from.
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const collection = decodeCountries(read('../../public/data/countries.topo.json'))
const source = read('../../data/countries.geojson') as FeatureCollection
const atlas = buildAtlas(collection, visitedCountries, HOME)
const sourceAtlas = buildAtlas(source, visitedCountries, HOME)

describe('featureCode', () => {
  it('falls back past Natural Earth "-99" placeholders', () => {
    expect(featureCode({ iso_a3: '-99', adm0_a3: 'FRA' })).toBe('FRA')
    expect(featureCode({ iso_a3: '-99', adm0_a3: 'nor' })).toBe('NOR')
  })

  it('rejects malformed codes', () => {
    expect(featureCode({ iso_a3: 'US', adm0_a3: 42 })).toBeNull()
  })
})

describe('featureIso2', () => {
  it('uses iso_a2, then wb_a2, then overrides', () => {
    expect(featureIso2({ iso_a2: 'JP' }, 'JPN')).toBe('JP')
    expect(featureIso2({ iso_a2: '-99', wb_a2: 'FR' }, 'FRA')).toBe('FR')
    expect(featureIso2({ iso_a2: '-99', wb_a2: '-99' }, 'NOR')).toBe('NO')
    expect(featureIso2({ iso_a2: '-99' }, 'KOS')).toBeNull()
  })
})

describe('buildAtlas (real dataset)', () => {
  it('resolves every visited code to a country polygon', () => {
    expect(atlas.diagnostics.unmatchedCodes).toEqual([])
    expect(atlas.totals.visited).toBe(new Set(visitedCountries).size)
  })

  it('resolves France and Norway, which lack iso_a3 codes', () => {
    expect(atlas.byCode.get('FRA')?.name).toBe('France')
    expect(atlas.byCode.get('NOR')?.name).toBe('Norway')
  })

  it("computes Earth's land area near 149 million km²", () => {
    // 1:110m Natural Earth polygons smooth away small islands and fjords, so the total runs a few percent low.
    expect(atlas.totals.worldLandKm2).toBeGreaterThan(136e6)
    expect(atlas.totals.worldLandKm2).toBeLessThan(156e6)
  })

  it('gets well-known country areas roughly right', () => {
    const area = (code: string) => atlas.byCode.get(code)!.areaKm2
    expect(area('BRA') / 8.5e6).toBeGreaterThan(0.93)
    expect(area('BRA') / 8.5e6).toBeLessThan(1.07)
    expect(area('AUS') / 7.69e6).toBeGreaterThan(0.93)
    expect(area('AUS') / 7.69e6).toBeLessThan(1.07)
  })

  it('places label points inside the right part of the world', () => {
    const usa = atlas.byCode.get('USA')!.center
    expect(usa.lat).toBeGreaterThan(30)
    expect(usa.lat).toBeLessThan(48)
    expect(usa.lng).toBeGreaterThan(-115)
    expect(usa.lng).toBeLessThan(-80)
  })

  it('numbers every visited country exactly once along the route', () => {
    const stops = atlas.visited.map((c) => c.stop)
    expect(stops).toEqual(Array.from({ length: atlas.totals.visited }, (_, i) => i + 1))
    expect(atlas.route.legs).toHaveLength(atlas.totals.visited + 1)
    expect(atlas.route.totalKm).toBeLessThanOrEqual(atlas.route.greedyKm)
  })

  it('survives TopoJSON quantization (area within 0.5%, center within 1% of the country’s size)', () => {
    expect(atlas.countries).toHaveLength(sourceAtlas.countries.length)
    for (const original of sourceAtlas.countries) {
      const decoded = atlas.byCode.get(original.code)!
      expect(Math.abs(decoded.areaKm2 - original.areaKm2) / original.areaKm2).toBeLessThan(0.005)
      // A fixed tolerance is wrong for both Vatican-sized and Russia-sized shapes:
      // scale it by the country's linear size (√area), with a 5 km floor.
      const shiftKm = haversineKm(decoded.center, original.center)
      expect(shiftKm).toBeLessThan(Math.max(5, 0.01 * Math.sqrt(original.areaKm2)))
    }
  })

  it('keeps shares between 0 and 1', () => {
    for (const share of [atlas.totals.populationShare, atlas.totals.landShare]) {
      expect(share).toBeGreaterThan(0)
      expect(share).toBeLessThan(1)
    }
  })

  it('counts continents from the data, not a hard-coded list', () => {
    const visited = new Set(atlas.visited.map((c) => c.continent))
    expect(atlas.totals.continentsVisited).toBe(visited.size)
  })
})

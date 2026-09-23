import { planRoute, type RoutePlan } from './route'
import {
  EQUATOR_KM,
  geometryAreaKm2,
  haversineKm,
  labelPoint,
  vertexCount,
  type Geometry,
  type LatLng,
} from './sphere'

export const CONTINENTS = [
  'North America',
  'South America',
  'Europe',
  'Africa',
  'Asia',
  'Oceania',
  'Antarctica',
] as const

export type Continent = (typeof CONTINENTS)[number] | 'Other'

export interface CountryFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: Geometry
}

export interface FeatureCollection {
  type: 'FeatureCollection'
  features: unknown[]
}

export interface Home extends LatLng {
  code: string
  name: string
}

export interface Country {
  code: string
  /** ISO 3166-1 alpha-2, for joining airports to countries. */
  iso2: string | null
  name: string
  nameEs: string
  continent: Continent
  subregion: string
  population: number
  areaKm2: number
  center: LatLng
  visited: boolean
  distanceFromHomeKm: number
  /** 1-based position on the optimized route, or null if not visited. */
  stop: number | null
  feature: CountryFeature
}

export interface ContinentTally {
  name: Continent
  visited: number
  total: number
}

export interface Atlas {
  home: Home
  countries: Country[]
  byCode: Map<string, Country>
  /** Visited countries in route order. */
  visited: Country[]
  totals: {
    countries: number
    visited: number
    continents: ContinentTally[]
    continentsVisited: number
    worldPopulation: number
    visitedPopulation: number
    populationShare: number
    worldLandKm2: number
    visitedLandKm2: number
    landShare: number
    hemispheres: { north: boolean; south: boolean; east: boolean; west: boolean }
  }
  extremes: {
    north: Country
    south: Country
    east: Country
    west: Country
    farthestFromHome: Country
    nearestToHome: Country
    farthestPair: { a: Country; b: Country; km: number }
  } | null
  route: RoutePlan & { stops: Country[]; laps: number }
  diagnostics: {
    features: number
    vertices: number
    matchedCodes: number
    unmatchedCodes: string[]
    geometryMs: number
    routeMs: number
  }
}

// Natural Earth marks some countries (France, Norway, Kosovo…) with iso_a3 "-99",
// so fall through the candidate fields until one yields a real code.
const CODE_FIELDS = ['iso_a3', 'ISO_A3', 'adm0_a3', 'ADM0_A3', 'ISO3166-1-Alpha-3', 'a3']
const NAME_FIELDS = ['name_long', 'name', 'admin', 'NAME', 'ADMIN']

export function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export function featureCode(properties: Record<string, unknown>): string | null {
  for (const field of CODE_FIELDS) {
    const code = normalizeCode(properties[field])
    if (code) return code
  }
  return null
}

// Natural Earth leaves iso_a2 as "-99" for a few countries; wb_a2 covers France but not Norway.
const ISO2_OVERRIDES: Record<string, string> = { NOR: 'NO', FRA: 'FR' }

export function featureIso2(properties: Record<string, unknown>, code: string): string | null {
  for (const field of ['iso_a2', 'wb_a2', 'ISO_A2']) {
    const value = properties[field]
    if (typeof value === 'string' && /^[A-Z]{2}$/.test(value)) return value
  }
  return ISO2_OVERRIDES[code] ?? null
}

function stringField(properties: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = properties[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function toContinent(value: unknown): Continent {
  return (CONTINENTS as readonly string[]).includes(value as string) ? (value as Continent) : 'Other'
}

export function isCountryFeature(value: unknown): value is CountryFeature {
  const feature = value as CountryFeature | null
  const type = feature?.geometry?.type
  return (
    typeof feature === 'object' &&
    feature !== null &&
    typeof feature.properties === 'object' &&
    (type === 'Polygon' || type === 'MultiPolygon')
  )
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function buildAtlas(collection: FeatureCollection, visitedCodes: string[], home: Home): Atlas {
  const features = collection.features.filter(isCountryFeature)
  const visitedSet = new Set(visitedCodes.map(normalizeCode).filter((c): c is string => c !== null))

  const t0 = now()
  let vertices = 0
  const countries: Country[] = []
  const byCode = new Map<string, Country>()

  for (const feature of features) {
    const code = featureCode(feature.properties)
    if (!code || byCode.has(code)) continue
    const center = labelPoint(feature.geometry)
    const country: Country = {
      code,
      iso2: featureIso2(feature.properties, code),
      name: stringField(feature.properties, NAME_FIELDS) ?? code,
      nameEs: stringField(feature.properties, ['name_es']) ?? '',
      continent: toContinent(feature.properties.continent),
      subregion: stringField(feature.properties, ['subregion']) ?? '',
      population: Number(feature.properties.pop_est) || 0,
      areaKm2: geometryAreaKm2(feature.geometry),
      center,
      visited: visitedSet.has(code),
      distanceFromHomeKm: haversineKm(home, center),
      stop: null,
      feature,
    }
    vertices += vertexCount(feature.geometry)
    countries.push(country)
    byCode.set(code, country)
  }
  const geometryMs = now() - t0

  const unmatchedCodes = [...visitedSet].filter((code) => !byCode.has(code))
  const visitedUnordered = countries.filter((c) => c.visited)

  // Route: index 0 is home, then every visited country.
  const t1 = now()
  const plan = planRoute([home, ...visitedUnordered.map((c) => c.center)], 0)
  const routeMs = now() - t1
  const stops = plan.order.slice(1).map((i) => visitedUnordered[i - 1])
  stops.forEach((country, i) => {
    country.stop = i + 1
  })

  const continents: ContinentTally[] = CONTINENTS.map((name) => ({
    name,
    total: countries.filter((c) => c.continent === name).length,
    visited: visitedUnordered.filter((c) => c.continent === name).length,
  }))

  const sum = (list: Country[], key: 'population' | 'areaKm2') => list.reduce((acc, c) => acc + c[key], 0)
  const worldPopulation = sum(countries, 'population')
  const visitedPopulation = sum(visitedUnordered, 'population')
  const worldLandKm2 = sum(countries, 'areaKm2')
  const visitedLandKm2 = sum(visitedUnordered, 'areaKm2')

  return {
    home,
    countries,
    byCode,
    visited: stops,
    totals: {
      countries: countries.length,
      visited: visitedUnordered.length,
      continents,
      continentsVisited: continents.filter((c) => c.visited > 0).length,
      worldPopulation,
      visitedPopulation,
      populationShare: worldPopulation ? visitedPopulation / worldPopulation : 0,
      worldLandKm2,
      visitedLandKm2,
      landShare: worldLandKm2 ? visitedLandKm2 / worldLandKm2 : 0,
      hemispheres: {
        north: visitedUnordered.some((c) => c.center.lat > 0),
        south: visitedUnordered.some((c) => c.center.lat < 0),
        east: visitedUnordered.some((c) => c.center.lng > 0),
        west: visitedUnordered.some((c) => c.center.lng < 0),
      },
    },
    extremes: findExtremes(visitedUnordered),
    route: { ...plan, stops, laps: plan.totalKm / EQUATOR_KM },
    diagnostics: {
      features: features.length,
      vertices,
      matchedCodes: visitedSet.size - unmatchedCodes.length,
      unmatchedCodes,
      geometryMs,
      routeMs,
    },
  }
}

function findExtremes(list: Country[]): Atlas['extremes'] {
  if (list.length === 0) return null
  const by = (score: (c: Country) => number) =>
    list.reduce((best, c) => (score(c) > score(best) ? c : best), list[0])

  let farthestPair = { a: list[0], b: list[0], km: 0 }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const km = haversineKm(list[i].center, list[j].center)
      if (km > farthestPair.km) farthestPair = { a: list[i], b: list[j], km }
    }
  }

  return {
    north: by((c) => c.center.lat),
    south: by((c) => -c.center.lat),
    east: by((c) => c.center.lng),
    west: by((c) => -c.center.lng),
    farthestFromHome: by((c) => c.distanceFromHomeKm),
    nearestToHome: by((c) => -c.distanceFromHomeKm),
    farthestPair,
  }
}

import { haversineKm } from '../geo/sphere'
import type { FlightLog } from './log'
import type { AirportRef, FlightsFile, PublicFlightsFile } from './types'

/** A flown route with no frequency attached. */
export interface RouteLink {
  key: string
  a: AirportRef
  b: AirportRef
  km: number
}

/** The route network: what the public site shows. */
export interface FlightNetwork {
  /** Most-connected first (by number of distinct destinations), then IATA. */
  airports: AirportRef[]
  routes: RouteLink[]
  /** Distinct destinations per airport. */
  degree: Map<string, number>
  totals: {
    airports: number
    routes: number
    countries: number
    longest: RouteLink | null
  }
}

/** Card data for one airport. `count` and `stats` exist only when the detailed log is unlocked. */
export interface AirportSummary {
  airport: AirportRef
  destinations: { other: AirportRef; km: number; count?: number }[]
  stats?: {
    visits: number
    departures: number
    arrivals: number
    firstMonth: string
    lastMonth: string
    airlines: { code: string; name: string; count: number }[]
  }
}

const pairKey = (x: string, y: string) => (x < y ? `${x}-${y}` : `${y}-${x}`)

/**
 * The privacy boundary: turn the detailed log into the public file.
 * Keeps airports and unique routes; drops counts, months, airlines, aircraft,
 * timings, air returns (a route to itself), and any ordering by frequency.
 */
export function toPublicFile(file: FlightsFile): PublicFlightsFile {
  const keys = new Set<string>()
  for (const f of file.flights) if (f.from !== f.to) keys.add(pairKey(f.from, f.to))
  const routes = [...keys].sort().map((k) => k.split('-') as [string, string])
  const used = new Set(routes.flat())
  const airports = Object.fromEntries(
    [...used].sort().map((iata) => {
      const { name, city, country, lat, lng } = file.airports[iata]
      return [iata, { iata, name, city, country, lat, lng }]
    }),
  )
  return { version: 1, airports, routes }
}

export function buildNetwork(file: PublicFlightsFile): FlightNetwork {
  const routes: RouteLink[] = file.routes
    .filter(([x, y]) => file.airports[x] && file.airports[y] && x !== y)
    .map(([x, y]) => {
      const [a, b] = x < y ? [file.airports[x], file.airports[y]] : [file.airports[y], file.airports[x]]
      return { key: pairKey(a.iata, b.iata), a, b, km: haversineKm(a, b) }
    })
    .sort((r, s) => r.key.localeCompare(s.key))

  const degree = new Map<string, number>()
  for (const r of routes) {
    degree.set(r.a.iata, (degree.get(r.a.iata) ?? 0) + 1)
    degree.set(r.b.iata, (degree.get(r.b.iata) ?? 0) + 1)
  }
  const airports = [...degree.keys()]
    .map((iata) => file.airports[iata])
    .sort((a, b) => degree.get(b.iata)! - degree.get(a.iata)! || a.iata.localeCompare(b.iata))

  return {
    airports,
    routes,
    degree,
    totals: {
      airports: airports.length,
      routes: routes.length,
      countries: new Set(airports.map((a) => a.country)).size,
      longest: routes.reduce<RouteLink | null>((best, r) => (!best || r.km > best.km ? r : best), null),
    },
  }
}

/** The same network, derived from an unlocked log (so both views share one shape). */
export function networkFromLog(log: FlightLog): FlightNetwork {
  const airports = Object.fromEntries(log.airports.map((a) => [a.item.iata, a.item]))
  return buildNetwork({ version: 1, airports, routes: log.routes.map((r) => [r.a.iata, r.b.iata]) })
}

export function networkAirport(network: FlightNetwork, iata: string): AirportSummary | null {
  const airport = network.airports.find((a) => a.iata === iata)
  if (!airport) return null
  const destinations = network.routes
    .filter((r) => r.a.iata === iata || r.b.iata === iata)
    .map((r) => ({ other: r.a.iata === iata ? r.b : r.a, km: r.km }))
    .sort((x, y) => y.km - x.km)
  return { airport, destinations }
}

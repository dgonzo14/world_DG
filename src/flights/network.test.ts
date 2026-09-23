import { describe, expect, it } from 'vitest'
import { buildFlightLog } from './log'
import { buildNetwork, networkAirport, networkFromLog, toPublicFile } from './network'
import type { FlightEntry, FlightsFile } from './types'

const airports = {
  ATL: { iata: 'ATL', name: 'Atlanta', city: 'Atlanta', country: 'US', lat: 33.6367, lng: -84.4281 },
  RDU: { iata: 'RDU', name: 'Raleigh–Durham', city: 'Raleigh', country: 'US', lat: 35.8776, lng: -78.7875 },
  HND: { iata: 'HND', name: 'Haneda', city: 'Tokyo', country: 'JP', lat: 35.5523, lng: 139.78 },
  LAX: { iata: 'LAX', name: 'Los Angeles', city: 'Los Angeles', country: 'US', lat: 33.9416, lng: -118.4085 },
}
const flight = (from: string, to: string, month = '2024-01'): FlightEntry => ({
  month,
  from,
  to,
  airline: 'DAL',
  aircraft: 'Boeing 737-900ER',
  blockMin: 70,
  arrDelayMin: 0,
})
const file: FlightsFile = {
  version: 1,
  through: '2024-03',
  airports,
  airlines: { DAL: 'Delta Air Lines' },
  flights: [
    // RDU–ATL flown five times, HND once, plus an air return; LAX is never used.
    ...Array.from({ length: 5 }, (_, i) => flight(i % 2 ? 'RDU' : 'ATL', i % 2 ? 'ATL' : 'RDU')),
    flight('ATL', 'HND', '2024-03'),
    flight('ATL', 'ATL', '2024-02'),
  ],
}

describe('toPublicFile (the privacy boundary)', () => {
  const pub = toPublicFile(file)

  it('keeps each route once, in alphabetical order, regardless of how often it was flown', () => {
    expect(pub.routes).toEqual([
      ['ATL', 'HND'],
      ['ATL', 'RDU'],
    ])
  })

  it('drops air returns and airports with no routes', () => {
    expect(pub.routes.flat()).not.toContain('LAX')
    expect(Object.keys(pub.airports)).toEqual(['ATL', 'HND', 'RDU'])
  })

  it('keeps only whitelisted fields: no counts, months, airlines, aircraft or timings', () => {
    expect(Object.keys(pub).sort()).toEqual(['airports', 'routes', 'version'])
    for (const a of Object.values(pub.airports)) {
      expect(Object.keys(a).sort()).toEqual(['city', 'country', 'iata', 'lat', 'lng', 'name'])
    }
    const text = JSON.stringify(pub)
    // Quoted keys, so "country" doesn't trip the "count" check.
    for (const key of ['month', 'airline', 'aircraft', 'blockMin', 'arrDelayMin', 'count', 'flights']) {
      expect(text).not.toContain(`"${key}"`)
    }
    expect(text).not.toContain('2024-')
  })

  it('produces identical output whether a route was flown once or a hundred times', () => {
    const once = toPublicFile({ ...file, flights: [flight('ATL', 'RDU'), flight('ATL', 'HND')] })
    expect(JSON.stringify(once)).toBe(JSON.stringify(pub))
  })
})

describe('buildNetwork', () => {
  const network = buildNetwork(toPublicFile(file))

  it('counts distinct destinations and ranks airports by them', () => {
    expect(network.degree.get('ATL')).toBe(2)
    expect(network.degree.get('RDU')).toBe(1)
    expect(network.airports[0].iata).toBe('ATL')
  })

  it('finds the longest route and totals', () => {
    expect(network.totals).toMatchObject({ airports: 3, routes: 2, countries: 2 })
    expect(network.totals.longest?.key).toBe('ATL-HND')
  })

  it('matches the network derived from the unlocked log', () => {
    const fromLog = networkFromLog(buildFlightLog(file))
    expect(fromLog.routes.map((r) => r.key)).toEqual(network.routes.map((r) => r.key))
    expect([...fromLog.degree]).toEqual([...network.degree])
  })

  it('summarises an airport with destinations but no counts', () => {
    const atl = networkAirport(network, 'ATL')!
    expect(atl.destinations.map((d) => d.other.iata)).toEqual(['HND', 'RDU']) // longest first
    expect(atl.destinations.every((d) => d.count === undefined)).toBe(true)
    expect(atl.stats).toBeUndefined()
    expect(networkAirport(network, 'LAX')).toBeNull()
  })
})

/**
 * Flighty CSV → public/data/flights.json
 *
 *   npm run import:flights -- ~/Downloads/FlightyExport-2026-09-23.csv
 *
 * Joins each flight to airport coordinates (OurAirports) and IANA time zones
 * (OpenFlights), converts local gate times to UTC for block time and delay,
 * and writes a deliberately coarse public file:
 *
 *   - flights scheduled after today are dropped (no future travel plans online)
 *   - dates are truncated to the month
 *   - flight numbers, gates, terminals, seats, booking codes and Flighty IDs are dropped
 *
 * The raw export never leaves your machine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, parseCsvRecords } from '../src/flights/csv.ts'
import { zonedTimeToUtc } from '../src/flights/time.ts'
import type { AirportRef, FlightEntry, FlightsFile } from '../src/flights/types.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const OUT = join(ROOT, 'public', 'data', 'flights.json')

const SOURCES = {
  ourairports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  openflights: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat',
}

const AIRLINES: Record<string, string> = {
  AMX: 'Aeroméxico',
  CCA: 'Air China',
  CMP: 'Copa Airlines',
  DAL: 'Delta Air Lines',
  EZY: 'easyJet',
  FPY: 'PLAY',
  JBU: 'JetBlue',
  JJA: 'Jeju Air',
  KAL: 'Korean Air',
  MSC: 'Air Cairo',
  RYR: 'Ryanair',
  SWA: 'Southwest',
  TRA: 'Transavia',
  TWB: "T'way Air",
  VLG: 'Vueling',
  VOI: 'Volaris',
}

interface Resolved extends AirportRef {
  tz: string
}

async function cached(name: string, url: string): Promise<string> {
  const file = join(CACHE, name)
  if (!existsSync(file)) {
    console.log(`Downloading ${url}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(file, await response.text())
  }
  return readFileSync(file, 'utf8')
}

async function loadAirports(codes: Set<string>): Promise<Map<string, Resolved>> {
  const ourAirports = parseCsvRecords(await cached('ourairports.csv', SOURCES.ourairports))
  // OpenFlights columns: id, name, city, country, IATA, ICAO, lat, lon, alt, offset, DST, tz, ...
  const openFlights = parseCsv(await cached('openflights-airports.dat', SOURCES.openflights))
  const NULL = '\\N' // OpenFlights' null marker
  const tzByIata = new Map<string, string>()
  const tzByIcao = new Map<string, string>()
  for (const row of openFlights) {
    const tz = row[11]
    if (!tz || tz === NULL) continue
    if (row[4] && row[4] !== NULL) tzByIata.set(row[4], tz)
    if (row[5] && row[5] !== NULL) tzByIcao.set(row[5], tz)
  }
  // Every zone seen per ISO country, for countries that only have one.
  const zonesByCountry = new Map<string, Set<string>>()
  for (const record of ourAirports) {
    const tz = tzByIata.get(record.iata_code)
    if (!tz) continue
    if (!zonesByCountry.has(record.iso_country)) zonesByCountry.set(record.iso_country, new Set())
    zonesByCountry.get(record.iso_country)!.add(tz)
  }

  const resolved = new Map<string, Resolved>()
  const problems: string[] = []
  for (const record of ourAirports) {
    const iata = record.iata_code
    // Closed airports can share an IATA code with the current one.
    if (!codes.has(iata) || resolved.has(iata) || record.type === 'closed') continue
    const icao = record.icao_code || record.gps_code
    // Time zone: by IATA, then ICAO, then the original ident (renamed airports:
    // West Palm Beach became DJT/KDJT but keeps ident KPBI), then the country's
    // zone if it only has one (Japan, Spain, …).
    let tz = tzByIata.get(iata) ?? tzByIcao.get(icao) ?? tzByIcao.get(record.ident)
    const countryZones = zonesByCountry.get(record.iso_country)
    if (!tz && countryZones?.size === 1) tz = [...countryZones][0]
    if (!tz) {
      problems.push(`${iata}: no time zone`)
      continue
    }
    resolved.set(iata, {
      iata,
      name: record.name,
      city: record.municipality,
      country: record.iso_country,
      lat: Number(Number(record.latitude_deg).toFixed(4)),
      lng: Number(Number(record.longitude_deg).toFixed(4)),
      tz,
    })
  }
  for (const code of codes) if (!resolved.has(code) && !problems.some((p) => p.startsWith(code))) problems.push(`${code}: unknown airport`)
  if (problems.length) throw new Error(`Could not resolve airports:\n  ${problems.join('\n  ')}`)
  return resolved
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: npm run import:flights -- <FlightyExport.csv>')
    process.exit(1)
  }
  const now = Date.now()
  const rows = parseCsvRecords(readFileSync(resolve(input), 'utf8'))
  const codes = new Set(rows.flatMap((r) => [r.From, r.To]).filter(Boolean))
  const airports = await loadAirports(codes)

  let future = 0
  let canceled = 0
  const warnings: string[] = []
  const kept: (FlightEntry & { depUtc: number })[] = []

  for (const row of rows) {
    if (row.Canceled === 'true') {
      canceled++
      continue
    }
    const from = airports.get(row.From)!
    const to = airports.get(row['Diverted To'] || row.To)!
    const schedDep = zonedTimeToUtc(row['Gate Departure (Scheduled)'], from.tz)
    if (schedDep > now) {
      future++
      continue
    }
    const dep = row['Gate Departure (Actual)'] ? zonedTimeToUtc(row['Gate Departure (Actual)'], from.tz) : schedDep
    const schedArr = zonedTimeToUtc(row['Gate Arrival (Scheduled)'], to.tz)
    const actualArr = row['Gate Arrival (Actual)'] ? zonedTimeToUtc(row['Gate Arrival (Actual)'], to.tz) : null
    let blockMin: number | null = Math.round(((actualArr ?? schedArr) - dep) / 60000)
    if (blockMin <= 0 || blockMin > 20 * 60) {
      warnings.push(`${row.Date} ${row.From}-${row.To}: implausible block time ${blockMin} min, dropped`)
      blockMin = null
    }
    if (!AIRLINES[row.Airline]) warnings.push(`Unknown airline code ${row.Airline}; shown as-is`)

    kept.push({
      depUtc: schedDep,
      month: row.Date.slice(0, 7),
      from: from.iata,
      to: to.iata,
      airline: row.Airline,
      aircraft: row['Aircraft Type Name'].trim() || null,
      blockMin,
      arrDelayMin: actualArr === null ? null : Math.round((actualArr - schedArr) / 60000),
    })
  }

  kept.sort((a, b) => a.depUtc - b.depUtc)
  const flights: FlightEntry[] = kept.map(({ depUtc: _drop, ...flight }) => flight)
  const used = new Set(flights.flatMap((f) => [f.from, f.to]))
  const publicAirports = Object.fromEntries(
    [...airports.values()]
      .filter((a) => used.has(a.iata))
      .sort((a, b) => a.iata.localeCompare(b.iata))
      .map(({ tz: _tz, ...a }) => [a.iata, a]),
  )
  const usedAirlines = new Set(flights.map((f) => f.airline))

  const file: FlightsFile = {
    version: 1,
    through: flights.at(-1)?.month ?? '',
    airports: publicAirports,
    airlines: Object.fromEntries([...usedAirlines].sort().map((code) => [code, AIRLINES[code] ?? code])),
    flights,
  }
  writeFileSync(OUT, JSON.stringify(file) + '\n')

  for (const w of new Set(warnings)) console.warn(`warn: ${w}`)
  console.log(
    `Wrote ${OUT}\n  ${flights.length} flights · ${Object.keys(publicAirports).length} airports · ${usedAirlines.size} airlines\n  excluded: ${future} future, ${canceled} canceled`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

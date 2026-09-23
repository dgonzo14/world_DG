/**
 * Flighty CSV → public/data/flights.public.json + public/data/flights.vault.json
 *
 *   FLIGHTS_CODE=… npm run import:flights -- ~/Downloads/FlightyExport.csv
 *   (or omit FLIGHTS_CODE to be prompted without echo)
 *
 * Joins each flight to airport coordinates (OurAirports) and IANA time zones
 * (OpenFlights), converts local gate times to UTC for block time and delay,
 * then writes two files:
 *
 *   flights.public.json  airports + unique routes only, alphabetical, no counts or dates
 *   flights.vault.json   the detailed log, AES-256-GCM encrypted (see src/flights/vault.ts)
 *
 * Before either is written:
 *   - flights scheduled after today are dropped (no future travel plans online)
 *   - dates are truncated to the month
 *   - flight numbers, gates, terminals, seats, booking codes and Flighty IDs are dropped
 *
 * The raw export and the access code never leave your machine.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { parseCsv, parseCsvRecords } from '../src/flights/csv.ts'
import { toPublicFile } from '../src/flights/network.ts'
import { zonedTimeToUtc } from '../src/flights/time.ts'
import type { AirportRef, FlightEntry, FlightsFile } from '../src/flights/types.ts'
import { seal } from '../src/flights/vault.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', '.cache')
const PUBLIC_OUT = join(ROOT, 'public', 'data', 'flights.public.json')
const VAULT_OUT = join(ROOT, 'public', 'data', 'flights.vault.json')

/** Read the access code from FLIGHTS_CODE, or prompt for it without echoing. */
async function accessCode(): Promise<string> {
  const fromEnv = process.env.FLIGHTS_CODE?.trim()
  if (fromEnv) return fromEnv
  if (!process.stdin.isTTY) throw new Error('Set FLIGHTS_CODE, or run in a terminal to be prompted.')
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  // Suppress echo: overwrite readline's output while the code is typed.
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput
  ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (text: string) => {
    if (text.includes('Access code')) write.call(rl, text)
  }
  const code = await new Promise<string>((done) => rl.question('Access code for the detailed log: ', done))
  rl.close()
  process.stdout.write('\n')
  return code.trim()
}

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
  const code = await accessCode()
  if (code.length < 12) {
    console.warn(
      'warn: codes under 12 characters can be brute-forced offline from the public vault file. ' +
        'Prefer something like XXXX-XXXX-XXXX from a password manager.',
    )
  }
  const publicFile = toPublicFile(file)
  writeFileSync(PUBLIC_OUT, JSON.stringify(publicFile) + '\n')
  writeFileSync(VAULT_OUT, JSON.stringify(await seal(JSON.stringify(file), code)) + '\n')

  for (const w of new Set(warnings)) console.warn(`warn: ${w}`)
  console.log(
    [
      `Wrote ${PUBLIC_OUT}`,
      `  public: ${Object.keys(publicFile.airports).length} airports · ${publicFile.routes.length} routes (no counts or dates)`,
      `Wrote ${VAULT_OUT}`,
      `  encrypted: ${flights.length} flights · ${usedAirlines.size} airlines`,
      `  excluded before writing: ${future} future, ${canceled} canceled`,
    ].join('\n'),
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

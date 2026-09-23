import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildFlightLog } from './log'
import type { FlightsFile, PublicFlightsFile } from './types'
import { unseal, type Vault } from './vault'

// Guards on the files that actually ship in public/data/.
const DATA = new URL('../../public/data/', import.meta.url)
const read = (name: string) => readFileSync(new URL(name, DATA), 'utf8')
const publicFile = JSON.parse(read('flights.public.json')) as PublicFlightsFile
const vault = JSON.parse(read('flights.vault.json')) as Vault

describe('published flight data', () => {
  it('ships no plaintext detailed log', () => {
    expect(existsSync(new URL('flights.json', DATA))).toBe(false)
    expect(readdirSync(DATA).sort()).toEqual(['countries.topo.json', 'flights.public.json', 'flights.vault.json'])
  })

  it('public file holds only airports and unique alphabetical routes', () => {
    expect(Object.keys(publicFile).sort()).toEqual(['airports', 'routes', 'version'])
    for (const a of Object.values(publicFile.airports)) {
      expect(Object.keys(a).sort()).toEqual(['city', 'country', 'iata', 'lat', 'lng', 'name'])
    }
    const keys = publicFile.routes.map(([a, b]) => {
      expect(a < b).toBe(true)
      return `${a}-${b}`
    })
    expect(keys).toEqual([...new Set(keys)].sort())
  })

  it('public file carries no counts, dates, airlines or timings', () => {
    const text = read('flights.public.json')
    for (const leak of ['"month"', '"airline"', '"aircraft"', '"blockMin"', '"arrDelayMin"', '"count"', '"flights"']) {
      expect(text).not.toContain(leak)
    }
  })

  it('vault is an opaque, well-formed envelope', () => {
    expect(Object.keys(vault).sort()).toEqual(['cipher', 'data', 'iterations', 'iv', 'kdf', 'salt', 'version'])
    expect(vault).toMatchObject({ version: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM' })
    expect(vault.iterations).toBeGreaterThanOrEqual(600_000)
    expect(read('flights.vault.json')).not.toContain('"month"')
  })

  // Runs only where the access code is available (your machine), never in CI.
  it.skipIf(!process.env.FLIGHTS_CODE)('vault decrypts and agrees with the public network', async () => {
    const file = JSON.parse(await unseal(vault, process.env.FLIGHTS_CODE!)) as FlightsFile
    const log = buildFlightLog(file)
    const now = new Date().toISOString().slice(0, 7)
    expect(file.flights.every((f) => f.month <= now)).toBe(true)
    expect(log.routes.map((r) => r.key).sort()).toEqual(publicFile.routes.map(([a, b]) => `${a}-${b}`))
  })
})

import { describe, expect, it } from 'vitest'
import { zonedTimeToUtc } from './time'

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)

describe('zonedTimeToUtc', () => {
  it('applies standard time (EST, UTC−5)', () => {
    expect(iso(zonedTimeToUtc('2024-01-27T08:24', 'America/New_York'))).toBe('2024-01-27T13:24')
  })

  it('applies daylight time (EDT, UTC−4)', () => {
    expect(iso(zonedTimeToUtc('2024-07-01T12:00', 'America/New_York'))).toBe('2024-07-01T16:00')
  })

  it('handles zones east of UTC and date rollover', () => {
    expect(iso(zonedTimeToUtc('2025-01-01T08:00', 'Asia/Tokyo'))).toBe('2024-12-31T23:00')
  })

  it('handles zones that no longer observe DST (Mexico, since 2022)', () => {
    expect(iso(zonedTimeToUtc('2026-03-15T10:00', 'America/Mazatlan'))).toBe('2026-03-15T17:00')
  })

  it('computes a real cross-zone block time (ATL → HND)', () => {
    // Departing 11:00 EDT (15:00Z) and arriving 14:15 JST next day (05:15Z) is 14h15m gate to gate.
    const dep = zonedTimeToUtc('2025-06-10T11:00', 'America/New_York')
    const arr = zonedTimeToUtc('2025-06-11T14:15', 'Asia/Tokyo')
    expect((arr - dep) / 60000).toBe(14 * 60 + 15)
  })

  it('resolves the DST gap and overlap without throwing', () => {
    const gap = zonedTimeToUtc('2024-03-10T02:30', 'America/New_York')
    const overlap = zonedTimeToUtc('2024-11-03T01:30', 'America/New_York')
    expect(['2024-03-10T06:30', '2024-03-10T07:30']).toContain(iso(gap))
    expect(['2024-11-03T05:30', '2024-11-03T06:30']).toContain(iso(overlap))
  })

  it('rejects malformed input', () => {
    expect(() => zonedTimeToUtc('yesterday', 'UTC')).toThrow()
  })
})

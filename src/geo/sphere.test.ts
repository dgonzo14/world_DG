import { describe, expect, it } from 'vitest'
import {
  EARTH_RADIUS_KM,
  geometryAreaKm2,
  haversineKm,
  labelPoint,
  polygonAreaKm2,
  ringAreaKm2,
  ringCentroid,
  type Ring,
} from './sphere'

const box = (west: number, south: number, east: number, north: number): Ring => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]

/** Exact area of a latitude/longitude box on the sphere. */
const exactBoxArea = (west: number, south: number, east: number, north: number) =>
  EARTH_RADIUS_KM ** 2 *
  ((east - west) * Math.PI) / 180 *
  (Math.sin((north * Math.PI) / 180) - Math.sin((south * Math.PI) / 180))

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 38.6, lng: -90.2 }, { lat: 38.6, lng: -90.2 })).toBe(0)
  })

  it('matches a quarter meridian', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 90, lng: 0 })).toBeCloseTo((Math.PI / 2) * EARTH_RADIUS_KM, 6)
  })

  it('handles antipodes without NaN', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 6)
  })

  it('agrees with a known city pair (London–Paris ≈ 344 km)', () => {
    const km = haversineKm({ lat: 51.5074, lng: -0.1278 }, { lat: 48.8566, lng: 2.3522 })
    expect(km).toBeGreaterThan(340)
    expect(km).toBeLessThan(346)
  })

  it('is symmetric', () => {
    const a = { lat: -33.9, lng: 18.4 }
    const b = { lat: 35.7, lng: 139.7 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })
})

describe('ringAreaKm2', () => {
  it('matches the closed-form area of a 1°×1° box at the equator', () => {
    expect(ringAreaKm2(box(0, 0, 1, 1))).toBeCloseTo(exactBoxArea(0, 0, 1, 1), 3)
  })

  it('matches a high-latitude box (where planar formulas fail)', () => {
    expect(ringAreaKm2(box(10, 60, 40, 80))).toBeCloseTo(exactBoxArea(10, 60, 40, 80), 3)
  })

  it('gives one eighth of the sphere for an octant', () => {
    expect(ringAreaKm2(box(0, 0, 90, 90))).toBeCloseTo((4 * Math.PI * EARTH_RADIUS_KM ** 2) / 8, 3)
  })

  it('ignores winding order', () => {
    const ring = box(-5, 10, 5, 20)
    expect(ringAreaKm2(ring.slice().reverse())).toBeCloseTo(ringAreaKm2(ring), 6)
  })

  it('returns 0 for degenerate rings', () => {
    expect(ringAreaKm2([[0, 0], [1, 1]])).toBe(0)
  })
})

describe('polygonAreaKm2 / geometryAreaKm2', () => {
  it('subtracts holes', () => {
    const outer = box(0, 0, 10, 10)
    const hole = box(2, 2, 4, 4)
    expect(polygonAreaKm2([outer, hole])).toBeCloseTo(ringAreaKm2(outer) - ringAreaKm2(hole), 6)
  })

  it('sums MultiPolygon parts', () => {
    const a = box(0, 0, 1, 1)
    const b = box(20, 20, 22, 21)
    expect(geometryAreaKm2({ type: 'MultiPolygon', coordinates: [[a], [b]] })).toBeCloseTo(
      ringAreaKm2(a) + ringAreaKm2(b),
      6,
    )
  })
})

describe('ringCentroid / labelPoint', () => {
  it('finds the centre of a symmetric box', () => {
    const c = ringCentroid(box(10, -10, 30, 10))
    expect(c.lat).toBeCloseTo(0, 6)
    expect(c.lng).toBeCloseTo(20, 6)
  })

  it('is not pulled toward densely sampled edges', () => {
    // Same square, but the east edge is sampled 50× more densely.
    const dense: Ring = [[0, 0], [10, 0]]
    for (let i = 1; i < 50; i++) dense.push([10, (10 * i) / 50])
    dense.push([10, 10], [0, 10], [0, 0])
    const c = ringCentroid(dense)
    expect(c.lng).toBeCloseTo(5, 1)
    expect(c.lat).toBeCloseTo(5, 0)
  })

  it('works across the antimeridian', () => {
    const c = ringCentroid(box(170, -5, 190, 5))
    expect(Math.abs(c.lng)).toBeCloseTo(180, 5)
  })

  it('uses the largest landmass of a MultiPolygon', () => {
    const mainland = box(-120, 30, -75, 48)
    const island = box(-160, 18, -155, 22)
    const p = labelPoint({ type: 'MultiPolygon', coordinates: [[island], [mainland]] })
    expect(p.lng).toBeGreaterThan(-120)
    expect(p.lng).toBeLessThan(-75)
  })
})

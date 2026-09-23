import { describe, expect, it } from 'vitest'
import { distanceMatrix, nearestNeighbor, planRoute, tourLength, twoOpt } from './route'
import type { LatLng } from './sphere'

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomPoints(count: number, seed: number): LatLng[] {
  const rand = mulberry32(seed)
  return Array.from({ length: count }, () => ({ lat: rand() * 140 - 70, lng: rand() * 360 - 180 }))
}

const isPermutation = (order: number[], n: number) =>
  order.length === n && new Set(order).size === n && order.every((i) => i >= 0 && i < n)

describe('distanceMatrix', () => {
  it('is symmetric with a zero diagonal', () => {
    const points = randomPoints(8, 1)
    const d = distanceMatrix(points)
    for (let i = 0; i < 8; i++) {
      expect(d[i * 8 + i]).toBe(0)
      for (let j = 0; j < 8; j++) expect(d[i * 8 + j]).toBe(d[j * 8 + i])
    }
  })
})

describe('planRoute', () => {
  it('handles empty and single-stop inputs', () => {
    expect(planRoute([]).order).toEqual([])
    const single = planRoute([{ lat: 1, lng: 1 }])
    expect(single.order).toEqual([0])
    expect(single.totalKm).toBe(0)
  })

  it('finds the perimeter of a square instead of a crossing tour', () => {
    // Deliberately ordered so a naive tour would cross itself.
    const square = [
      { lat: 0, lng: 0 },
      { lat: 10, lng: 10 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 0 },
    ]
    const plan = planRoute(square)
    const d = distanceMatrix(square)
    const perimeter = tourLength([0, 2, 1, 3], d, 4)
    expect(plan.totalKm).toBeCloseTo(perimeter, 6)
  })

  it.each([5, 12, 30, 60])('returns a valid tour for %i random stops', (n) => {
    const points = randomPoints(n, n)
    const plan = planRoute(points, 0)
    expect(isPermutation(plan.order, n)).toBe(true)
    expect(plan.order[0]).toBe(0)
    expect(plan.legs).toHaveLength(n)
    expect(plan.legs.reduce((acc, leg) => acc + leg.km, 0)).toBeCloseTo(plan.totalKm, 6)
  })

  it('never does worse than the greedy tour', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const plan = planRoute(randomPoints(25, seed))
      expect(plan.totalKm).toBeLessThanOrEqual(plan.greedyKm + 1e-6)
    }
  })

  it('stops at a 2-opt local optimum (no improving swap remains)', () => {
    const points = randomPoints(30, 99)
    const n = points.length
    const d = distanceMatrix(points)
    const { order } = twoOpt(nearestNeighbor(d, n, 0), d, n)
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const [a, b, c, e] = [order[i - 1], order[i], order[k], order[(k + 1) % n]]
        const delta = d[a * n + c] + d[b * n + e] - d[a * n + b] - d[c * n + e]
        expect(delta).toBeGreaterThanOrEqual(-1e-6)
      }
    }
  })

  it('keeps the requested start fixed', () => {
    const plan = planRoute(randomPoints(15, 7), 4)
    expect(plan.order[0]).toBe(4)
  })
})

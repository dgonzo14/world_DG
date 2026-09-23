import { haversineKm, type LatLng } from './sphere'

/**
 * Route planning over great-circle distances: a symmetric travelling-salesman
 * tour that starts and ends at `start`.
 *
 * 1. Nearest-neighbour construction gives a fast, decent tour (O(n²)).
 * 2. 2-opt local search removes crossing legs: for every pair of edges
 *    (a→b, c→d) it checks whether reconnecting as (a→c, b→d) is shorter and,
 *    if so, reverses the segment b…c. It repeats until no move improves.
 *
 * For a few dozen stops this runs in well under a millisecond and reliably
 * lands within a few percent of optimal.
 */

export interface Leg {
  from: number
  to: number
  km: number
}

export interface RoutePlan {
  /** Indices into the input, beginning with `start`. */
  order: number[]
  legs: Leg[]
  totalKm: number
  greedyKm: number
  passes: number
  improvingMoves: number
  pairsCompared: number
}

export function distanceMatrix(points: LatLng[]): Float64Array {
  const n = points.length
  const matrix = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(points[i], points[j])
      matrix[i * n + j] = d
      matrix[j * n + i] = d
    }
  }
  return matrix
}

export function tourLength(order: number[], dist: Float64Array, n: number, closed = true): number {
  let total = 0
  for (let i = 0; i < order.length - 1; i++) total += dist[order[i] * n + order[i + 1]]
  if (closed && order.length > 1) total += dist[order[order.length - 1] * n + order[0]]
  return total
}

export function nearestNeighbor(dist: Float64Array, n: number, start = 0): number[] {
  const visited = new Uint8Array(n)
  const order = [start]
  visited[start] = 1
  let current = start
  for (let step = 1; step < n; step++) {
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < n; j++) {
      if (!visited[j] && dist[current * n + j] < bestDist) {
        best = j
        bestDist = dist[current * n + j]
      }
    }
    visited[best] = 1
    order.push(best)
    current = best
  }
  return order
}

export function twoOpt(
  initial: number[],
  dist: Float64Array,
  n: number,
  maxPasses = 100,
): { order: number[]; passes: number; improvingMoves: number } {
  const order = initial.slice()
  const m = order.length
  let passes = 0
  let improvingMoves = 0
  let improved = true

  while (improved && passes < maxPasses) {
    improved = false
    passes++
    // i starts at 1 so the start city stays fixed at position 0.
    for (let i = 1; i < m - 1; i++) {
      for (let k = i + 1; k < m; k++) {
        const a = order[i - 1]
        const b = order[i]
        const c = order[k]
        const d = order[(k + 1) % m]
        const delta = dist[a * n + c] + dist[b * n + d] - dist[a * n + b] - dist[c * n + d]
        if (delta < -1e-9) {
          reverse(order, i, k)
          improved = true
          improvingMoves++
        }
      }
    }
  }
  return { order, passes, improvingMoves }
}

function reverse(arr: number[], from: number, to: number) {
  for (let i = from, j = to; i < j; i++, j--) {
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
}

export function planRoute(points: LatLng[], start = 0): RoutePlan {
  const n = points.length
  if (n === 0) {
    return { order: [], legs: [], totalKm: 0, greedyKm: 0, passes: 0, improvingMoves: 0, pairsCompared: 0 }
  }
  const dist = distanceMatrix(points)
  const greedy = nearestNeighbor(dist, n, start)
  const greedyKm = tourLength(greedy, dist, n)
  const { order, passes, improvingMoves } = twoOpt(greedy, dist, n)

  const legs: Leg[] = order.map((from, i) => {
    const to = order[(i + 1) % order.length]
    return { from, to, km: dist[from * n + to] }
  })
  if (n === 1) legs.length = 0

  return {
    order,
    legs,
    totalKm: tourLength(order, dist, n),
    greedyKm,
    passes,
    improvingMoves,
    pairsCompared: (n * (n - 1)) / 2,
  }
}

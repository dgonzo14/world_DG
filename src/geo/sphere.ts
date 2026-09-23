/**
 * Spherical geometry on a mean-radius Earth.
 *
 * Everything here is dependency-free so it can be unit tested in Node and
 * reused outside the globe (build scripts, workers, etc.).
 */

/** IUGG mean Earth radius. */
export const EARTH_RADIUS_KM = 6371.0088
/** Length of the equator on the mean sphere. */
export const EQUATOR_KM = 2 * Math.PI * EARTH_RADIUS_KM

/** GeoJSON position: [longitude, latitude] in degrees. */
export type Position = [number, number] | number[]
export type Ring = Position[]
export type PolygonCoords = Ring[]

export interface LatLng {
  lat: number
  lng: number
}

export type Geometry =
  | { type: 'Polygon'; coordinates: PolygonCoords }
  | { type: 'MultiPolygon'; coordinates: PolygonCoords[] }

type Vec3 = [number, number, number]

const RAD = Math.PI / 180

export const toRadians = (degrees: number) => degrees * RAD
export const toDegrees = (radians: number) => radians / RAD

/** Great-circle distance using the haversine formula (stable for small distances). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Area enclosed by a ring on the sphere, in km².
 *
 * Uses the line-integral form from Chamberlain & Duquette (2007),
 * "Some algorithms for polygons on a sphere":
 *
 *   A = R² / 2 · Σ (λᵢ₊₁ − λᵢ) · (2 + sin φᵢ + sin φᵢ₊₁)
 *
 * Winding order only flips the sign, so the absolute value is returned.
 */
export function ringAreaKm2(ring: Ring): number {
  const n = ring.length
  if (n < 3) return 0

  let sum = 0
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[(i + 1) % n]
    sum += toRadians(lng2 - lng1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)))
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2)
}

/** Outer ring minus holes. */
export function polygonAreaKm2(polygon: PolygonCoords): number {
  if (polygon.length === 0) return 0
  const [outer, ...holes] = polygon
  const area = ringAreaKm2(outer) - holes.reduce((acc, hole) => acc + ringAreaKm2(hole), 0)
  return Math.max(0, area)
}

export function geometryAreaKm2(geometry: Geometry): number {
  if (geometry.type === 'Polygon') return polygonAreaKm2(geometry.coordinates)
  return geometry.coordinates.reduce((acc, polygon) => acc + polygonAreaKm2(polygon), 0)
}

function toVec3(position: Position): Vec3 {
  const lng = toRadians(position[0])
  const lat = toRadians(position[1])
  const c = Math.cos(lat)
  return [c * Math.cos(lng), c * Math.sin(lng), Math.sin(lat)]
}

function fromVec3([x, y, z]: Vec3): LatLng {
  const len = Math.hypot(x, y, z)
  return { lat: toDegrees(Math.asin(z / len)), lng: toDegrees(Math.atan2(y, x)) }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Area-weighted centroid of a ring, projected back onto the sphere.
 *
 * The ring is fanned into triangles around the mean vertex; each triangle's
 * centroid is weighted by its signed area. Unlike a plain vertex average this
 * is not biased toward densely sampled coastlines, and it works for concave
 * shapes because inward-folding triangles subtract.
 */
export function ringCentroid(ring: Ring): LatLng {
  const points = ring.map(toVec3)
  const n = points.length
  if (n === 0) return { lat: 0, lng: 0 }

  const origin: Vec3 = [0, 0, 0]
  for (const p of points) {
    origin[0] += p[0] / n
    origin[1] += p[1] / n
    origin[2] += p[2] / n
  }
  if (n < 3) return fromVec3(origin)

  // Triangle (origin, a, b): centroid (origin + a + b) / 3, weight = signed area.
  // The constant factors (1/2 and 1/3) cancel when normalising.
  const acc: Vec3 = [0, 0, 0]
  let totalWeight = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const normal = cross(sub(a, origin), sub(b, origin))
    const weight = Math.hypot(...normal) * Math.sign(dot(normal, origin))
    acc[0] += weight * (origin[0] + a[0] + b[0])
    acc[1] += weight * (origin[1] + a[1] + b[1])
    acc[2] += weight * (origin[2] + a[2] + b[2])
    totalWeight += weight
  }
  if (totalWeight === 0) return fromVec3(origin)
  return fromVec3([acc[0] / totalWeight, acc[1] / totalWeight, acc[2] / totalWeight])
}

/**
 * A representative point for camera targeting: the centroid of the largest
 * landmass (so the United States resolves to the contiguous states, not a
 * point pulled toward Alaska and Hawaii).
 */
export function labelPoint(geometry: Geometry): LatLng {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let best = polygons[0]
  let bestArea = -1
  for (const polygon of polygons) {
    const area = polygonAreaKm2(polygon)
    if (area > bestArea) {
      best = polygon
      bestArea = area
    }
  }
  return ringCentroid(best[0])
}

export function vertexCount(geometry: Geometry): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.reduce((acc, polygon) => acc + polygon.reduce((a, ring) => a + ring.length, 0), 0)
}

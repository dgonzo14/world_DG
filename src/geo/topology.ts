import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { FeatureCollection } from './atlas'

/** Decode the country topology written by scripts/build-topology.ts back into GeoJSON features. */
export function decodeCountries(topology: Topology<{ countries: GeometryCollection }>): FeatureCollection {
  return feature(topology, topology.objects.countries) as unknown as FeatureCollection
}

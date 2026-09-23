const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const formatCompact = (value: number) => compact.format(value)
export const formatKm = (km: number) => `${whole.format(Math.round(km))} km`
export const formatKm2 = (km2: number) => `${km2 >= 1e5 ? compact.format(km2) : whole.format(km2)} km²`
export const formatPercent = (share: number, digits = 0) => `${(share * 100).toFixed(digits)}%`
export const formatMs = (ms: number) => (ms < 1 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(1)} ms`)
export const pad2 = (n: number) => String(n).padStart(2, '0')

export function formatLatLng(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lng).toFixed(1)}°${ew}`
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatBuildDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const ISO3_FIELDS = [
  'ISO_A3',
  'ADM0_A3',
  'iso_a3',
  'ISO3166-1-Alpha-3',
  'WB_A3',
  'BRK_A3',
  'GU_A3',
  'SOV_A3',
]

const COUNTRY_NAME_FIELDS = [
  'ADMIN',
  'NAME',
  'name',
  'NAME_EN',
  'FORMAL_EN',
  'BRK_NAME',
  'WB_NAME',
]

const INVALID_CODES = new Set(['', '-99'])

function getSearchSources(feature) {
  const properties =
    feature?.properties && typeof feature.properties === 'object'
      ? feature.properties
      : null

  // Search both `properties` and the top-level feature to stay tolerant of dataset differences.
  return [properties, feature]
}

function findStringValue(sources, fields) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue
    }

    for (const field of fields) {
      const value = source[field]

      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return null
}

export function normalizeCountryCode(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedCode = value.trim().toUpperCase()

  if (INVALID_CODES.has(normalizedCode)) {
    return null
  }

  return /^[A-Z]{3}$/.test(normalizedCode) ? normalizedCode : null
}

export function getCountryIso3(feature) {
  const code = findStringValue(getSearchSources(feature), ISO3_FIELDS)
  return normalizeCountryCode(code)
}

export function getCountryName(feature) {
  return (
    findStringValue(getSearchSources(feature), COUNTRY_NAME_FIELDS) ??
    getCountryIso3(feature) ??
    'Unknown country'
  )
}

export function isVisited(feature, visitedCountryLookup) {
  const countryCode = getCountryIso3(feature)

  if (!countryCode) {
    return false
  }

  if (visitedCountryLookup instanceof Set) {
    return visitedCountryLookup.has(countryCode)
  }

  if (!Array.isArray(visitedCountryLookup)) {
    return false
  }

  return visitedCountryLookup.some(
    (candidateCode) => normalizeCountryCode(candidateCode) === countryCode,
  )
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

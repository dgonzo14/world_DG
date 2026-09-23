import { useDeferredValue, useMemo, useState, type RefObject } from 'react'
import { CONTINENTS, type Atlas, type Continent } from '../geo/atlas'
import { formatKm, pad2 } from '../lib/format'

type Sort = 'route' | 'name' | 'distance'

interface Props {
  atlas: Atlas
  selectedCode: string | null
  onSelect: (code: string) => void
  searchRef: RefObject<HTMLInputElement | null>
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export default function CountryList({ atlas, selectedCode, onSelect, searchRef }: Props) {
  const [query, setQuery] = useState('')
  const [continent, setContinent] = useState<Continent | 'all'>('all')
  const [visitedOnly, setVisitedOnly] = useState(true)
  const [sort, setSort] = useState<Sort>('route')
  const deferredQuery = useDeferredValue(query)

  const rows = useMemo(() => {
    const q = normalize(deferredQuery.trim())
    const list = atlas.countries.filter((c) => {
      if (visitedOnly && !c.visited) return false
      if (continent !== 'all' && c.continent !== continent) return false
      if (!q) return true
      // Match English, Spanish, or the ISO code, ignoring accents ("mexico" finds México).
      return normalize(c.name).includes(q) || normalize(c.nameEs).includes(q) || c.code.toLowerCase() === q
    })
    const byName = (a: typeof list[number], b: typeof list[number]) => a.name.localeCompare(b.name)
    if (sort === 'name') return list.sort(byName)
    if (sort === 'distance') return list.sort((a, b) => a.distanceFromHomeKm - b.distanceFromHomeKm)
    return list.sort((a, b) => (a.stop ?? Infinity) - (b.stop ?? Infinity) || byName(a, b))
  }, [atlas.countries, deferredQuery, continent, visitedOnly, sort])

  return (
    <div className="list">
      <div className="list__controls">
        <label className="search">
          <span className="sr-only">Search countries</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search in English or Español…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd aria-hidden="true">/</kbd>
        </label>

        <div className="chips" role="group" aria-label="Filter by continent">
          <button type="button" className="chip" aria-pressed={continent === 'all'} onClick={() => setContinent('all')}>
            All
          </button>
          {CONTINENTS.filter((name) => name !== 'Antarctica').map((name) => {
            const tally = atlas.totals.continents.find((t) => t.name === name)!
            return (
              <button
                key={name}
                type="button"
                className="chip"
                aria-pressed={continent === name}
                onClick={() => setContinent(name)}
              >
                {name} <span>{visitedOnly ? tally.visited : tally.total}</span>
              </button>
            )
          })}
        </div>

        <div className="list__row">
          <label className="toggle">
            <input type="checkbox" checked={visitedOnly} onChange={(e) => setVisitedOnly(e.target.checked)} />
            <span>Visited only</span>
          </label>
          <label className="select">
            <span className="sr-only">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="route">Route order</option>
              <option value="name">A–Z</option>
              <option value="distance">Distance from {atlas.home.code}</option>
            </select>
          </label>
        </div>
      </div>

      <p className="list__count" aria-live="polite">
        {rows.length} {rows.length === 1 ? 'country' : 'countries'}
      </p>

      {rows.length === 0 ? (
        <p className="empty">
          No matches. {visitedOnly && 'Try turning off “Visited only”.'}
        </p>
      ) : (
        <ol className="rows">
          {rows.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className={`row ${c.visited ? 'row--visited' : ''}`}
                aria-current={c.code === selectedCode ? 'true' : undefined}
                onClick={() => onSelect(c.code)}
              >
                <span className="row__stop">{c.stop ? pad2(c.stop) : '··'}</span>
                <span className="row__code">{c.code}</span>
                <span className="row__name">
                  {c.name}
                  <small>{c.continent}</small>
                </span>
                <span className="row__km">{formatKm(c.distanceFromHomeKm)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

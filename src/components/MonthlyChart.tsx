import { useId, useState } from 'react'
import type { MonthTally } from '../flights/log'
import { formatKm, formatMonth } from '../lib/format'

interface Props {
  months: MonthTally[]
  /** Month to emphasise (during replay). */
  highlight: string | null
}

const W = 400
const H = 150
const PAD = { top: 18, right: 4, bottom: 22, left: 22 }
const GAP = 2
const MAX_BAR = 24
const RADIUS = 3

/** Round the axis max up to a clean number (5, 10, 15, 20…). */
function niceMax(value: number) {
  const step = value <= 10 ? 5 : 10
  return Math.max(step, Math.ceil(value / step) * step)
}

/** Column with rounded data-end and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export default function MonthlyChart({ months, highlight }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const titleId = useId()
  const max = niceMax(Math.max(...months.map((m) => m.count), 1))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const band = plotW / months.length
  const barW = Math.min(MAX_BAR, band - GAP)
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const peak = months.reduce((best, m, i) => (m.count > months[best].count ? i : best), 0)
  const ticks = [0, max / 2, max]
  const hovered = hover === null ? null : months[hover]

  return (
    <figure className="chart">
      <figcaption id={titleId} className="chart__title">
        Flights per month
      </figcaption>
      <div className="chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={titleId} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart__tick" x={PAD.left - 6} y={y(t) + 3} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const x = PAD.left + i * band + (band - barW) / 2
            const h = y(0) - y(m.count)
            const active = m.month === highlight || i === hover
            return (
              <g key={m.month}>
                {m.count > 0 && (
                  <path
                    className={`chart__bar ${active ? 'is-active' : ''} ${highlight && !active ? 'is-muted' : ''}`}
                    d={columnPath(x, y(m.count), barW, h)}
                  />
                )}
                {/* Full-height hit target, wider than the mark. */}
                <rect
                  className="chart__hit"
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  onMouseEnter={() => setHover(i)}
                />
                {m.month.endsWith('-01') && (
                  <text className="chart__tick" x={x} y={H - 6}>
                    {m.month.slice(0, 4)}
                  </text>
                )}
              </g>
            )
          })}
          {months[peak].count > 0 && hover === null && (
            <text
              className="chart__label"
              x={PAD.left + peak * band + band / 2}
              y={y(months[peak].count) - 5}
              textAnchor="middle"
            >
              {months[peak].count}
            </text>
          )}
        </svg>
        {hovered && hover !== null && (
          <div
            className="chart__tip"
            style={{ left: `${((PAD.left + hover * band + band / 2) / W) * 100}%` }}
            role="status"
          >
            <b>{formatMonth(hovered.month)}</b>
            <span>
              {hovered.count} {hovered.count === 1 ? 'flight' : 'flights'}
              {hovered.count > 0 && ` · ${formatKm(hovered.km)}`}
            </span>
          </div>
        )}
      </div>
      <details className="chart__table">
        <summary>View as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Flights</th>
              <th scope="col">Distance</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{formatMonth(m.month)}</th>
                <td>{m.count}</td>
                <td>{m.count ? formatKm(m.km) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

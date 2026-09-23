/**
 * Convert a local wall-clock time at an airport ("2024-03-10T08:15") to a UTC
 * timestamp using its IANA zone, DST included. Flighty exports gate times in
 * local time, so block time across zones needs this.
 */
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string) {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** Offset of `timeZone` from UTC at instant `utcMs`, in milliseconds (e.g. -5h for EST). */
export function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  )
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export function zonedTimeToUtc(local: string, timeZone: string): number {
  const m = LOCAL.exec(local.trim())
  if (!m) throw new Error(`Unrecognised local time "${local}"`)
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))

  // Guess with the offset at the wall time, then correct once: if the guess
  // lands on the other side of a DST switch, the second offset is the right one.
  let utc = wall - zoneOffsetMs(wall, timeZone)
  const corrected = zoneOffsetMs(utc, timeZone)
  if (wall - corrected !== utc) utc = wall - corrected
  return utc
}

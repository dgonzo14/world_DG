import { describe, expect, it } from 'vitest'
import { parseSelection, selectionHash } from './useHashSelection'

describe('parseSelection', () => {
  it('reads countries and airports, normalising case', () => {
    expect(parseSelection('#/country/jpn')).toEqual({ type: 'country', code: 'JPN' })
    expect(parseSelection('#/airport/ATL')).toEqual({ type: 'airport', code: 'ATL' })
  })

  it('ignores anything else', () => {
    for (const hash of ['', '#', '#/country/JP', '#/city/ATL', '#/airport/ATL/extra', '#top']) {
      expect(parseSelection(hash)).toBeNull()
    }
  })

  it('round-trips through selectionHash', () => {
    const selection = { type: 'airport', code: 'HND' } as const
    expect(parseSelection(selectionHash(selection)!)).toEqual(selection)
    expect(selectionHash(null)).toBeNull()
  })
})

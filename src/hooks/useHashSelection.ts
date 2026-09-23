import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Keeps the current selection in the URL (`#/country/JPN`, `#/airport/ATL`) so
 * any view can be shared or bookmarked, and the browser's back button works.
 */
export type Selection = { type: 'country' | 'airport'; code: string }

const PATTERN = /^#\/(country|airport)\/([A-Za-z]{3})$/

export function parseSelection(hash: string): Selection | null {
  const match = PATTERN.exec(hash)
  return match ? { type: match[1] as Selection['type'], code: match[2].toUpperCase() } : null
}

export function selectionHash(selection: Selection | null): string | null {
  return selection ? `#/${selection.type}/${selection.code}` : null
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useHashSelection() {
  // The snapshot must be a primitive (a new object each call would loop), so
  // subscribe to the raw hash and parse it separately.
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '')
  const selection = useMemo(() => parseSelection(hash), [hash])

  /** `replace` avoids flooding history during tours and keyboard stepping. */
  const setSelection = useCallback((next: Selection | null, options: { replace?: boolean } = {}) => {
    const target = selectionHash(next)
    if ((target ?? '') === window.location.hash) return
    const url = target ?? `${window.location.pathname}${window.location.search}`
    if (options.replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    // push/replaceState don't fire hashchange; notify subscribers ourselves.
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }, [])

  return [selection, setSelection] as const
}

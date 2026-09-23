import { useCallback, useSyncExternalStore } from 'react'

/**
 * Keeps the selected country in the URL (`#/country/JPN`) so any view can be
 * shared or bookmarked, and the browser's back button works.
 */
const PATTERN = /^#\/country\/([A-Za-z]{3})$/

function read(): string | null {
  const match = PATTERN.exec(window.location.hash)
  return match ? match[1].toUpperCase() : null
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useHashSelection() {
  const code = useSyncExternalStore(subscribe, read, () => null)

  /** `replace` avoids flooding history during tours and keyboard stepping. */
  const setCode = useCallback((next: string | null, options: { replace?: boolean } = {}) => {
    if (next === read()) return
    const url = next
      ? `#/country/${next}`
      : `${window.location.pathname}${window.location.search}`
    if (options.replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    // push/replaceState don't fire hashchange; notify subscribers ourselves.
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }, [])

  return [code, setCode] as const
}

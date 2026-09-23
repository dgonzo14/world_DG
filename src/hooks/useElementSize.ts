import { useEffect, useRef, useState } from 'react'

/** Tracks an element's content box with a ResizeObserver. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined

    const update = (width: number, height: number) => {
      const next = { width: Math.floor(width), height: Math.floor(height) }
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
    }

    // Measure synchronously: ResizeObserver only reports on the next rendering
    // step, which never comes while the tab is in the background.
    const rect = element.getBoundingClientRect()
    update(rect.width, rect.height)

    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

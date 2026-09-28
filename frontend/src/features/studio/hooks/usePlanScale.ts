import { useEffect, useState, type RefObject } from "react"

/** Converts CSS-pixel hit areas into SVG meters, including narrow mobile viewports. */
export function usePlanScale(
  surface: RefObject<SVGSVGElement | null>,
  viewBox: string
) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(
    function observePlanViewport() {
      const element = surface.current
      if (!element) return
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect
        setSize({ width: rect.width, height: rect.height })
      })
      observer.observe(element)
      return () => observer.disconnect()
    },
    [surface]
  )
  const [, , width, height] = viewBox.split(" ").map(Number)
  return Math.min(size.width / width, size.height / height) || 50
}

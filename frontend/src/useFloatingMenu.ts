import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

export function useFloatingMenuStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  preferredWidth = 320,
) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      const gap = 6
      const width = Math.max(rect.width, preferredWidth)
      const panelHeight = panelRef.current?.offsetHeight ?? 360
      const maxHeight = Math.min(520, window.innerHeight - 16)
      const spaceBelow = window.innerHeight - rect.bottom - gap
      const spaceAbove = rect.top - gap

      let top = rect.bottom + gap
      if (spaceBelow < Math.min(panelHeight, maxHeight) && spaceAbove > spaceBelow) {
        top = Math.max(8, rect.top - gap - Math.min(panelHeight, maxHeight))
      }

      let left = rect.left
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8)
      }

      setStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight,
        zIndex: 10000,
        visibility: 'visible',
      })
    }

    update()
    const frame = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef, panelRef, preferredWidth])

  return style
}

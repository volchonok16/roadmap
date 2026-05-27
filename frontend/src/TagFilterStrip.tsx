import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuStyle } from './useFloatingMenu'

type TagFilterStripProps = {
  tags: string[]
  selectedTags: string[]
  onToggle: (tag: string) => void
  onClear: () => void
}

function formatTriggerLabel(selectedTags: string[], total: number) {
  if (!total) return 'нет тегов'
  if (!selectedTags.length) return String(total)
  return `${selectedTags.length} / ${total}`
}

export default function TagFilterStrip({ tags, selectedTags, onToggle, onClear }: TagFilterStripProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const panelStyle = useFloatingMenuStyle(open, anchorRef, panelRef, 560)
  const isFiltering = selectedTags.length > 0

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (anchorRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const panel = open ? (
    <div
      id={panelId}
      ref={panelRef}
      className="filter-dropdown-menu floating-menu-portal tag-filter-menu"
      style={panelStyle}
      role="group"
      aria-label="Фильтр по тегам"
    >
      <div className="tag-filter-menu-head">
        <span className="tag-filter-menu-title">Теги на выбранных досках</span>
        {isFiltering ? (
          <button type="button" className="tag-filter-menu-reset" onClick={onClear}>
            Сбросить фильтр
          </button>
        ) : null}
      </div>
      {tags.length ? (
        <>
          <p className="tag-filter-hint">Все выключены — видны все ЗНИ. Включите теги для фильтрации.</p>
          <div className="tag-filter-grid">
            {tags.map((tag) => {
              const active = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  className={`tag-filter-pill ${active ? 'is-on' : 'is-off'}`}
                  title={active ? `Убрать «${tag}»` : `Фильтр по «${tag}»`}
                  aria-pressed={active}
                  onClick={() => onToggle(tag)}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <p className="tag-filter-empty">Нет тегов у ЗНИ на выбранных досках за период</p>
      )}
    </div>
  ) : null

  return (
    <div className="tag-filter-strip-dropdown" ref={anchorRef}>
      <button
        type="button"
        className={`tag-filter-strip-trigger ${open ? 'is-open' : ''} ${isFiltering ? 'is-filtering' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={!tags.length}
        title={
          tags.length
            ? 'Выбрать теги для фильтрации ЗНИ'
            : 'Теги появятся после выгрузки с выбранных досок'
        }
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tag-filter-strip-trigger-label">{formatTriggerLabel(selectedTags, tags.length)}</span>
        <span className="filter-dropdown-chevron" aria-hidden />
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  )
}

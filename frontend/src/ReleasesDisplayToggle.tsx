import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuStyle } from './useFloatingMenu'

import type { ReleasesDisplayMode } from './releaseUtils'

export type { ReleasesDisplayMode }

type ReleasesDisplayChoice = 'hidden' | ReleasesDisplayMode

type ReleasesDisplayToggleProps = {
  showReleases: boolean
  displayMode: ReleasesDisplayMode
  releaseCount: number
  onChange: (choice: ReleasesDisplayChoice) => void
}

const OPTIONS: { id: ReleasesDisplayMode; label: string; hint: string }[] = [
  {
    id: 'nearest',
    label: 'Ближайший релиз',
    hint: 'Одна зелёная линия — следующий релиз от сегодня',
  },
  {
    id: 'subsequent',
    label: 'Последующие релизы',
    hint: 'Все релизы после ближайшего, без самой ближайшей даты',
  },
  {
    id: 'all',
    label: 'Все релизы',
    hint: 'Зелёные линии для каждой уникальной даты релиза в периоде',
  },
]

export function readReleasesDisplayMode(): ReleasesDisplayMode {
  try {
    const saved = localStorage.getItem('roadmap-releases-display-mode')
    if (saved === 'nearest' || saved === 'subsequent' || saved === 'all') return saved
  } catch {
    /* ignore */
  }
  return 'all'
}

export default function ReleasesDisplayToggle({
  showReleases,
  displayMode,
  releaseCount,
  onChange,
}: ReleasesDisplayToggleProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const panelStyle = useFloatingMenuStyle(open, anchorRef, panelRef, 300)

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

  const pick = (choice: ReleasesDisplayChoice) => {
    onChange(choice)
    setOpen(false)
  }

  const panel = open ? (
    <div
      id={panelId}
      ref={panelRef}
      className="filter-dropdown-menu floating-menu-portal errors-display-menu"
      style={panelStyle}
      role="menu"
      aria-label="Отображение релизов"
    >
      <div className="errors-display-menu-head">Как показывать релизы</div>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitemradio"
          aria-checked={showReleases && displayMode === option.id}
          className={`filter-dropdown-option errors-display-option ${showReleases && displayMode === option.id ? 'is-selected' : ''}`}
          onClick={() => pick(option.id)}
        >
          <span className="errors-display-option-text">
            <span className="filter-dropdown-option-label">{option.label}</span>
            <span className="errors-display-option-hint">{option.hint}</span>
          </span>
          {showReleases && displayMode === option.id ? <span className="filter-dropdown-check" aria-hidden>✓</span> : null}
        </button>
      ))}
      <div className="errors-display-menu-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={`filter-dropdown-option errors-display-option ${!showReleases ? 'is-selected' : ''}`}
        onClick={() => pick('hidden')}
      >
        <span className="filter-dropdown-option-label">Скрыть релизы</span>
        {!showReleases ? <span className="filter-dropdown-check" aria-hidden>✓</span> : null}
      </button>
    </div>
  ) : null

  return (
    <div className="errors-display-toggle releases-display-toggle" ref={anchorRef}>
      <button
        type="button"
        className={`timeline-head-toggle timeline-head-toggle-release ${showReleases ? 'is-on' : ''} ${open ? 'is-menu-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={
          showReleases
            ? displayMode === 'all'
              ? `Релизы: все (${releaseCount} в периоде). Нажмите для выбора режима.`
              : displayMode === 'nearest'
                ? 'Релизы: только ближайший. Нажмите для выбора режима.'
                : 'Релизы: последующие после ближайшего. Нажмите для выбора режима.'
            : `Показать линии релизов (${releaseCount} в периоде) — выберите режим`
        }
        onClick={() => setOpen((value) => !value)}
      >
        Отображать релизы
        <span className="errors-display-chevron" aria-hidden />
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloatingMenuStyle } from './useFloatingMenu'

export type ErrorsDisplayMode = 'merged' | 'block'

type ErrorsDisplayChoice = 'hidden' | ErrorsDisplayMode

type ErrorsDisplayToggleProps = {
  showErrors: boolean
  displayMode: ErrorsDisplayMode
  onChange: (choice: ErrorsDisplayChoice) => void
}

const OPTIONS: { id: ErrorsDisplayMode; label: string; hint: string }[] = [
  {
    id: 'merged',
    label: 'Вместе с требованиями',
    hint: 'Строки ошибок в общем порядке по колонке статуса',
  },
  {
    id: 'block',
    label: 'Отдельными строками',
    hint: 'Под каждым требованием, без смешивания по статусу',
  },
]

export function readErrorsDisplayMode(): ErrorsDisplayMode {
  try {
    const saved = localStorage.getItem('roadmap-errors-display-mode')
    if (saved === 'block') return 'block'
  } catch {
    /* ignore */
  }
  return 'merged'
}

export default function ErrorsDisplayToggle({ showErrors, displayMode, onChange }: ErrorsDisplayToggleProps) {
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

  const pick = (choice: ErrorsDisplayChoice) => {
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
      aria-label="Отображение ошибок"
    >
      <div className="errors-display-menu-head">Как показывать ошибки</div>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitemradio"
          aria-checked={showErrors && displayMode === option.id}
          className={`filter-dropdown-option errors-display-option ${showErrors && displayMode === option.id ? 'is-selected' : ''}`}
          onClick={() => pick(option.id)}
        >
          <span className="errors-display-option-text">
            <span className="filter-dropdown-option-label">{option.label}</span>
            <span className="errors-display-option-hint">{option.hint}</span>
          </span>
          {showErrors && displayMode === option.id ? <span className="filter-dropdown-check" aria-hidden>✓</span> : null}
        </button>
      ))}
      <div className="errors-display-menu-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={`filter-dropdown-option errors-display-option ${!showErrors ? 'is-selected' : ''}`}
        onClick={() => pick('hidden')}
      >
        <span className="filter-dropdown-option-label">Скрыть ошибки</span>
        {!showErrors ? <span className="filter-dropdown-check" aria-hidden>✓</span> : null}
      </button>
    </div>
  ) : null

  return (
    <div className="errors-display-toggle" ref={anchorRef}>
      <button
        type="button"
        className={`timeline-head-toggle timeline-head-toggle-errors ${showErrors ? 'is-on' : ''} ${open ? 'is-menu-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={
          showErrors
            ? displayMode === 'merged'
              ? 'Ошибки: вместе с требованиями по статусу. Нажмите для выбора режима.'
              : 'Ошибки: отдельными строками под требованием. Нажмите для выбора режима.'
            : 'Показать ошибки TFS — выберите режим отображения'
        }
        onClick={() => setOpen((value) => !value)}
      >
        Отображать ошибки
        <span className="errors-display-chevron" aria-hidden />
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  )
}

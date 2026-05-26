import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { BoardOption } from './boardPreferences'
import { useFloatingMenuStyle } from './useFloatingMenu'

type BoardMultiPickerProps = {
  boards: BoardOption[]
  favoriteIds: string[]
  pinnedId: string | null
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function formatBoardPickerLabel(selectedIds: string[], boards: BoardOption[]) {
  if (!selectedIds.length) return `Все доски (${boards.length})`
  if (selectedIds.length === 1) {
    return boards.find((board) => board.id === selectedIds[0])?.name ?? '1 доска'
  }
  return `${selectedIds.length} доски`
}

export default function BoardMultiPicker({
  boards,
  favoriteIds,
  pinnedId,
  selectedIds,
  onChange,
}: BoardMultiPickerProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const panelStyle = useFloatingMenuStyle(open, anchorRef, panelRef, 300)
  const triggerLabel = formatBoardPickerLabel(selectedIds, boards)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const favoriteBoardIds = useMemo(
    () => boards.filter((board) => favoriteIds.includes(board.id)).map((board) => board.id),
    [boards, favoriteIds],
  )
  const allBoardsMode = !selectedIds.length
  const favoritesMode =
    favoriteBoardIds.length > 0 && favoriteBoardIds.every((id) => selectedSet.has(id))

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

  const toggleBoard = (boardId: string) => {
    if (selectedSet.has(boardId)) {
      const next = selectedIds.filter((id) => id !== boardId)
      onChange(next)
      return
    }
    onChange([...selectedIds, boardId])
  }

  const selectFavorites = () => {
    onChange(favoriteBoardIds)
  }

  const boardPrefix = (boardId: string) => {
    if (pinnedId === boardId) return '📌'
    if (favoriteIds.includes(boardId)) return '★'
    return null
  }

  const panel = open ? (
    <div
      id={panelId}
      ref={panelRef}
      className="filter-dropdown-menu floating-menu-portal board-picker-menu"
      style={panelStyle}
      role="listbox"
      aria-label="Выбор досок"
      aria-multiselectable="true"
    >
      <div className="board-picker-menu-actions">
        <button
          type="button"
          className={allBoardsMode ? 'is-active' : ''}
          onClick={() => onChange([])}
        >
          Все доски
        </button>
        <button
          type="button"
          className={favoritesMode ? 'is-active' : ''}
          disabled={!favoriteBoardIds.length}
          onClick={selectFavorites}
        >
          Избранные
        </button>
      </div>
      {boards.map((board) => {
        const checked = selectedSet.has(board.id)
        const prefix = boardPrefix(board.id)
        return (
          <button
            key={board.id}
            type="button"
            role="option"
            aria-selected={checked}
            className={`filter-dropdown-option ${checked ? 'is-selected' : ''}`}
            onClick={() => toggleBoard(board.id)}
          >
            {prefix ? <span className="filter-dropdown-prefix">{prefix}</span> : null}
            <span className="filter-dropdown-option-label">{board.name}</span>
            {checked ? <span className="filter-dropdown-check" aria-hidden>✓</span> : null}
          </button>
        )
      })}
    </div>
  ) : null

  return (
    <div className="filter-dropdown filter-dropdown-board board-multi-picker" ref={anchorRef}>
      <button
        type="button"
        className={`filter-dropdown-trigger filter-dropdown-trigger-board ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Доски"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="filter-dropdown-trigger-label">{triggerLabel}</span>
        <span className="filter-dropdown-chevron" aria-hidden />
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  )
}

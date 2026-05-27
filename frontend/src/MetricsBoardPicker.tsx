import { useMemo, useState } from 'react'
import {
  readFavoriteBoardIds,
  readPinnedBoardId,
  sortBoardOptions,
  splitBoardOptions,
  toggleFavoriteBoardId,
  writeFavoriteBoardIds,
  writePinnedBoardId,
  type BoardOption,
} from './boardPreferences'

type MetricsBoardPickerProps = {
  boards: BoardOption[]
  value: string
  onChange: (boardId: string) => void
  disabled?: boolean
}

function boardOptionLabel(board: BoardOption, favoriteIds: string[], pinnedId: string | null) {
  const prefix = pinnedId === board.id ? '📌 ' : favoriteIds.includes(board.id) ? '★ ' : ''
  return `${prefix}${board.name}`
}

export default function MetricsBoardPicker({
  boards,
  value,
  onChange,
  disabled = false,
}: MetricsBoardPickerProps) {
  const [favoriteBoardIds, setFavoriteBoardIds] = useState(readFavoriteBoardIds)
  const [pinnedBoardId, setPinnedBoardId] = useState(readPinnedBoardId)

  const sortedBoards = useMemo(
    () => sortBoardOptions(boards, favoriteBoardIds, pinnedBoardId),
    [boards, favoriteBoardIds, pinnedBoardId],
  )
  const { favorites, others } = useMemo(
    () => splitBoardOptions(sortedBoards, favoriteBoardIds),
    [sortedBoards, favoriteBoardIds],
  )

  const canActOnBoard = Boolean(value)
  const isFavorite = canActOnBoard && favoriteBoardIds.includes(value)
  const isPinned = canActOnBoard && pinnedBoardId === value

  const toggleFavorite = () => {
    if (!value) return
    const next = toggleFavoriteBoardId(value, favoriteBoardIds)
    setFavoriteBoardIds(next)
    writeFavoriteBoardIds(next)
    if (pinnedBoardId === value && !next.includes(value)) {
      setPinnedBoardId(null)
      writePinnedBoardId(null)
    }
  }

  const togglePin = () => {
    if (!value) return
    const next = isPinned ? null : value
    setPinnedBoardId(next)
    writePinnedBoardId(next)
    if (next && !favoriteBoardIds.includes(next)) {
      const favorites = [...favoriteBoardIds, next]
      setFavoriteBoardIds(favorites)
      writeFavoriteBoardIds(favorites)
    }
  }

  const renderOptions = (items: BoardOption[]) =>
    items.map((board) => (
      <option key={board.id} value={board.id}>
        {boardOptionLabel(board, favoriteBoardIds, pinnedBoardId)}
      </option>
    ))

  return (
    <div className="board-picker metrics-board-picker metrics-widget-no-drag">
      <div className="board-picker-main metrics-board-picker-main">
        <span className="metrics-header-board-picker-label">Доска</span>
        <select
          className="metrics-header-board-select filter-bar-input"
          value={value}
          disabled={disabled || !boards.length}
          aria-label="Доска стрима"
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Все доски</option>
          {favorites.length ? <optgroup label="Избранные">{renderOptions(favorites)}</optgroup> : null}
          {others.length ? (
            <optgroup label={favorites.length ? 'Остальные' : 'Доски'}>{renderOptions(others)}</optgroup>
          ) : null}
        </select>
      </div>
      <button
        type="button"
        className={`board-action-btn board-action-btn-fav ${isFavorite ? 'is-on' : ''}`}
        title={
          canActOnBoard
            ? isFavorite
              ? 'Убрать из избранного'
              : 'В избранное'
            : 'Выберите доску (не «Все доски»)'
        }
        disabled={!canActOnBoard || disabled}
        onClick={toggleFavorite}
      >
        ★
      </button>
      <button
        type="button"
        className={`board-action-btn board-action-btn-pin ${isPinned ? 'is-on' : ''}`}
        title={
          canActOnBoard
            ? isPinned
              ? 'Открепить доску'
              : 'Закрепить доску'
            : 'Выберите доску (не «Все доски»)'
        }
        disabled={!canActOnBoard || disabled}
        onClick={togglePin}
      >
        📌
      </button>
    </div>
  )
}

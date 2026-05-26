const PINNED_BOARD_KEY = 'roadmap-pinned-board-id'
const FAVORITE_BOARDS_KEY = 'roadmap-favorite-board-ids'
const SELECTED_BOARDS_KEY = 'roadmap-selected-board-ids'

export function readPinnedBoardId(): string | null {
  const value = localStorage.getItem(PINNED_BOARD_KEY)
  return value && value.trim() ? value.trim() : null
}

export function writePinnedBoardId(boardId: string | null) {
  if (!boardId || boardId === 'all') {
    localStorage.removeItem(PINNED_BOARD_KEY)
    return
  }
  localStorage.setItem(PINNED_BOARD_KEY, boardId)
}

export function readFavoriteBoardIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITE_BOARDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

export function readSelectedBoardIds(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_BOARDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

export function writeSelectedBoardIds(ids: string[]) {
  const unique = Array.from(new Set(ids))
  if (!unique.length) {
    localStorage.removeItem(SELECTED_BOARDS_KEY)
    return
  }
  localStorage.setItem(SELECTED_BOARDS_KEY, JSON.stringify(unique))
}

export function readInitialSelectedBoardIds() {
  const saved = readSelectedBoardIds()
  if (saved.length) return saved
  const pinned = readPinnedBoardId()
  if (pinned && pinned !== 'all') return [pinned]
  return []
}

export function writeFavoriteBoardIds(ids: string[]) {
  const unique = Array.from(new Set(ids))
  if (!unique.length) {
    localStorage.removeItem(FAVORITE_BOARDS_KEY)
    return
  }
  localStorage.setItem(FAVORITE_BOARDS_KEY, JSON.stringify(unique))
}

export function toggleFavoriteBoardId(boardId: string, current: string[]) {
  if (current.includes(boardId)) return current.filter((id) => id !== boardId)
  return [...current, boardId]
}

export type BoardOption = { id: string; name: string; areaPath?: string | null }

export function sortBoardOptions(
  boards: BoardOption[],
  favoriteIds: string[],
  pinnedId: string | null,
) {
  const favoriteSet = new Set(favoriteIds)
  return [...boards].sort((left, right) => {
    const leftPinned = left.id === pinnedId ? 0 : 1
    const rightPinned = right.id === pinnedId ? 0 : 1
    if (leftPinned !== rightPinned) return leftPinned - rightPinned

    const leftFav = favoriteSet.has(left.id) ? 0 : 1
    const rightFav = favoriteSet.has(right.id) ? 0 : 1
    if (leftFav !== rightFav) return leftFav - rightFav

    return left.name.localeCompare(right.name, 'ru')
  })
}

export function splitBoardOptions(boards: BoardOption[], favoriteIds: string[]) {
  const favoriteSet = new Set(favoriteIds)
  const favorites = boards.filter((board) => favoriteSet.has(board.id))
  const others = boards.filter((board) => !favoriteSet.has(board.id))
  return { favorites, others }
}

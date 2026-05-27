import type { ChangeRequest } from './roadmapTypes'

export function itemMatchesBoard(item: ChangeRequest, boardId: string) {
  if (item.boardId && item.boardId === boardId) return true
  if (boardId.startsWith('area:') && item.areaPath) {
    const areaKey = `area:${item.areaPath}`
    return areaKey === boardId || item.areaPath === boardId.slice(5)
  }
  return false
}

/** Фильтр ЗНИ по доске стрима; пустой boardId — все доски. */
export function filterItemsByBoard(items: ChangeRequest[], boardId: string | null) {
  if (!boardId?.trim()) return items
  return items.filter((item) => itemMatchesBoard(item, boardId))
}

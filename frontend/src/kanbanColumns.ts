import type { ChangeRequest } from './roadmapTypes'

/** Порядок колонок ЗНИ на типовой Kanban-доске (слева → справа). */
export const zniColumnOrder = [
  'New',
  'Backlog',
  'Express Analysis',
  'Analysis Backlog',
  'Full Analysis',
  'Analysis',
  'Development',
  'UAT',
  'Pilot',
  'Closed',
  'TERM',
]

const zniColumnAliases: Record<string, string> = {
  'full analysis': 'Analysis',
  'express analysis': 'Express Analysis',
  'analysis backlog': 'Analysis Backlog',
  '11. closed': 'Closed',
}

export function normalizeZniColumn(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return trimmed
  const alias = zniColumnAliases[trimmed.toLowerCase()]
  if (alias) return alias
  const exact = zniColumnOrder.find((item) => item.toLowerCase() === trimmed.toLowerCase())
  return exact ?? trimmed
}

/** Колонка Kanban (System.BoardColumn) или workflow State, если колонки нет. */
export function rawZniColumn(item: ChangeRequest) {
  const boardColumn = item.column?.trim()
  if (boardColumn) return boardColumn
  return normalizeZniColumn(item.state)
}

/** Подпись колонки на карточке ЗНИ — как в TFS. */
export function zniColumnLabel(item: ChangeRequest) {
  return rawZniColumn(item)
}

/** Ключ фильтра по имени колонки (общий для всех досок). */
export function columnNameFilterKey(column: string) {
  return `col::${column.trim().toLowerCase()}`
}

/** @deprecated Используйте columnNameFilterKey */
export function columnFilterKey(_boardId: string | null | undefined, column: string) {
  return columnNameFilterKey(column)
}

export function isColumnKeyVisible(key: string, hiddenColumnKeys: string[]) {
  return !hiddenColumnKeys.includes(key)
}

export function isZniColumnVisible(item: ChangeRequest, hiddenColumnKeys: string[]) {
  return isColumnKeyVisible(columnNameFilterKey(rawZniColumn(item)), hiddenColumnKeys)
}

export function isColumnNameVisible(column: string, hiddenColumnKeys: string[]) {
  return isColumnKeyVisible(columnNameFilterKey(column), hiddenColumnKeys)
}

/**
 * Типовой порядок колонок ЗНИ (Digital Inbox и похожие доски), если каталог TFS ещё не подтянут.
 */
export const typicalZniBoardColumnOrder = [
  'Backlog',
  'To do',
  'Briefing/Formulation',
  'Pre-analysis Backlog',
  'Pre-analysis',
  'Design Backlog',
  'Design',
  'Architecture',
  'Analysis Backlog',
  'Full Analysis',
  'Analysis',
  'Development',
  'UAT',
  'Pilot',
  'Closed',
]

function columnOrderRank(column: string, boardOrder: string[]) {
  const lower = column.trim().toLowerCase()
  const fromBoard = boardOrder.findIndex((item) => item.trim().toLowerCase() === lower)
  if (fromBoard >= 0) return fromBoard
  const fromTypical = typicalZniBoardColumnOrder.findIndex((item) => item.toLowerCase() === lower)
  if (fromTypical >= 0) return fromTypical + boardOrder.length
  return boardOrder.length + typicalZniBoardColumnOrder.length + 1
}

/** Порядок колонок как на Kanban-доске TFS: сначала каталог доски, затем новые из ЗНИ. */
export function mergeColumnsInBoardOrder(boardOrder: string[], discovered: Iterable<string>) {
  const seen = new Set<string>()
  const result: string[] = []
  const push = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(trimmed)
  }
  for (const name of boardOrder) push(name)
  for (const name of discovered) push(name)
  return result
}

/** Упорядочить колонки для полоски фильтра (каталог доски → типовой порядок → по алфавиту). */
export function sortColumnsForBoard(boardOrder: string[], discovered: Iterable<string>) {
  const merged = mergeColumnsInBoardOrder(boardOrder, discovered)
  if (boardOrder.length > 0) return merged
  return [...merged].sort((left, right) => {
    const rankDiff = columnOrderRank(left, boardOrder) - columnOrderRank(right, boardOrder)
    if (rankDiff !== 0) return rankDiff
    return left.localeCompare(right, 'ru')
  })
}

export type BoardColumnFilterGroup = {
  boardId: string | null
  boardName: string
  columns: string[]
}

export type BoardColumnCatalog = {
  id: string
  name: string
  columns?: string[]
}

export function buildBoardColumnFilters(
  items: ChangeRequest[],
  boards: BoardColumnCatalog[] = [],
): BoardColumnFilterGroup[] {
  const columnsByBoard = new Map<string | null, Set<string>>()
  const nameByBoard = new Map<string | null, string>()
  const orderByBoard = new Map<string | null, string[]>()

  for (const board of boards) {
    const boardId = board.id ?? null
    nameByBoard.set(boardId, board.name.trim() || 'Без доски')
    if (board.columns?.length) {
      orderByBoard.set(boardId, board.columns)
      columnsByBoard.set(boardId, new Set(board.columns))
    }
  }

  for (const item of items) {
    const boardId = item.boardId ?? null
    const column = rawZniColumn(item)
    if (!columnsByBoard.has(boardId)) columnsByBoard.set(boardId, new Set())
    columnsByBoard.get(boardId)!.add(column)
    if (!nameByBoard.has(boardId)) {
      nameByBoard.set(boardId, item.boardName?.trim() || item.areaPath?.split('\\').pop() || 'Без доски')
    }
  }

  return [...columnsByBoard.entries()]
    .map(([boardId, columns]) => {
      const boardOrder = orderByBoard.get(boardId) ?? []
      return {
        boardId,
        boardName: nameByBoard.get(boardId) ?? 'Без доски',
        columns: sortColumnsForBoard(boardOrder, [...columns]),
      }
    })
    .sort((left, right) => left.boardName.localeCompare(right.boardName, 'ru'))
}

/** Колонки только для выбранных досок (или досок, где есть ЗНИ). */
export function buildSelectedBoardColumnFilters(
  items: ChangeRequest[],
  boards: BoardColumnCatalog[],
  selectedBoardIds: string[],
): BoardColumnFilterGroup[] {
  const all = buildBoardColumnFilters(items, boards)
  if (selectedBoardIds.length > 0) {
    return all.filter((group) => group.boardId && selectedBoardIds.includes(group.boardId))
  }
  const boardIdsInItems = new Set(
    items.map((item) => item.boardId).filter((id): id is string => Boolean(id)),
  )
  if (boardIdsInItems.size === 0) return all
  return all.filter((group) => group.boardId && boardIdsInItems.has(group.boardId))
}

export type MergedColumnFilter = {
  column: string
  boardNames: string[]
}

/** Одна полоска колонок при нескольких досках: одинаковые имена объединяются. */
export function buildMergedColumnFilters(groups: BoardColumnFilterGroup[]): MergedColumnFilter[] {
  if (groups.length === 0) return []

  const canonical = new Map<string, string>()
  const boardsByLower = new Map<string, string[]>()

  for (const group of groups) {
    for (const column of group.columns) {
      const lower = column.trim().toLowerCase()
      if (!lower) continue
      if (!canonical.has(lower)) canonical.set(lower, column.trim())
      const names = boardsByLower.get(lower) ?? []
      if (!names.includes(group.boardName)) names.push(group.boardName)
      boardsByLower.set(lower, names)
    }
  }

  const ordered = sortColumnsForBoard(typicalZniBoardColumnOrder, [...canonical.values()])
  return ordered.map((column) => ({
    column,
    boardNames: boardsByLower.get(column.toLowerCase()) ?? [],
  }))
}

export function columnColorClass(column: string) {
  switch (column) {
    case 'New':
      return 'state-new'
    case 'Backlog':
    case 'To do':
      return 'state-backlog'
    case 'Briefing/Formulation':
    case 'Design Backlog':
    case 'Design':
      return 'state-design'
    case 'Pre-analysis Backlog':
    case 'Pre-analysis':
      return 'state-pre-analysis'
    case 'Architecture':
    case 'Full Analysis':
      return 'state-analysis'
    case 'Express Analysis':
      return 'state-express'
    case 'Analysis Backlog':
      return 'state-analysis-bl'
    case 'Analysis':
      return 'state-analysis'
    case 'Development':
      return 'state-development'
    case 'UAT':
      return 'state-uat'
    case 'Pilot':
      return 'state-pilot'
    case 'Closed':
    case 'TERM':
    case 'Done':
      return 'state-closed'
    default: {
      const lower = column.toLowerCase()
      if (lower.includes('briefing') || lower.includes('formulation') || lower === 'design') return 'state-design'
      if (lower.includes('pre-analysis') || lower.includes('pre analysis')) return 'state-pre-analysis'
      if (lower.includes('accept')) return 'state-pilot'
      if (lower.includes('uat') || lower.includes('test')) return 'state-uat'
      if (lower.includes('closed') || lower.includes('done') || lower.includes('merge')) return 'state-closed'
      if (lower.includes('review') || lower.includes('analysis') || lower.includes('architecture')) return 'state-analysis'
      if (lower.includes('develop') || lower.includes('code')) return 'state-development'
      if (lower.includes('backlog') || lower.includes('to do') || lower === 'new') return 'state-backlog'
      return 'state-default'
    }
  }
}

export function columnBarClass(column: string) {
  switch (column) {
    case 'New':
      return 'new'
    case 'Backlog':
    case 'To do':
      return 'backlog'
    case 'Express Analysis':
      return 'express'
    case 'Analysis Backlog':
      return 'analysis-bl'
    case 'Analysis':
    case 'Architecture':
    case 'Full Analysis':
    case 'Pre-analysis':
    case 'Pre-analysis Backlog':
      return 'analysis'
    case 'Briefing/Formulation':
    case 'Design':
    case 'Design Backlog':
      return 'backlog'
    case 'Development':
      return 'development'
    case 'UAT':
      return 'uat'
    case 'Pilot':
      return 'pilot'
    case 'Closed':
    case 'TERM':
    case 'Done':
      return 'closed'
    default: {
      const lower = column.toLowerCase()
      if (lower.includes('accept') || lower.includes('pilot')) return 'pilot'
      if (lower.includes('uat') || lower.includes('test')) return 'uat'
      if (lower.includes('closed') || lower.includes('done') || lower.includes('merge')) return 'closed'
      if (lower.includes('review') || lower.includes('analysis') || lower.includes('architecture')) return 'analysis'
      if (lower.includes('develop') || lower.includes('code')) return 'development'
      if (lower.includes('design') || lower.includes('briefing')) return 'backlog'
      return 'default'
    }
  }
}

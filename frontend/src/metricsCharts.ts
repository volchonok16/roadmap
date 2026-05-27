import { parseReleaseDateFromLabel, parseReleaseLabelFromTitle } from './releaseUtils'
import { isRequirementClosed } from './metricsSummary'
import type { ChangeRequest, Requirement } from './roadmapTypes'

export type MetricBarPoint = {
  label: string
  value: number
  highlight?: boolean
  sortKey: number
}

export function resolveRequirementReleaseLabel(
  requirement: Requirement,
  parent: ChangeRequest,
): string | null {
  const direct = requirement.release?.trim()
  if (direct) return direct
  const fromTitle = parseReleaseLabelFromTitle(requirement.title)
  if (fromTitle) return fromTitle
  const parentRelease = parent.release?.trim()
  if (parentRelease) return parentRelease
  return parseReleaseLabelFromTitle(parent.title)
}

export function shortReleaseLabel(label: string) {
  const match = label.match(/^(\d{4})\.(\d{2})\.(\d{2})/)
  if (!match) return label.length > 10 ? `${label.slice(0, 10)}…` : label
  return `${match[3]}.${match[2]}`
}

function releaseSortKey(label: string) {
  const date = parseReleaseDateFromLabel(label)
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER
}

export function buildClosedDeliveriesByRelease(items: ChangeRequest[], maxBars = 12): MetricBarPoint[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const requirement of item.requirements) {
      if (!isRequirementClosed(requirement)) continue
      const release = resolveRequirementReleaseLabel(requirement, item)
      const key = release ?? 'Без релиза'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([label, value]) => ({
      label,
      value,
      sortKey: label === 'Без релиза' ? Number.MAX_SAFE_INTEGER : releaseSortKey(label),
    }))
    .sort((left, right) => left.sortKey - right.sortKey || right.value - left.value)
    .slice(-maxBars)
}

/** Команда в метриках = доска TFS (board), с которой собираются ЗНИ. */
export function boardLabel(item: ChangeRequest) {
  return item.boardName?.trim() || item.areaPath?.split('\\').pop() || 'Без доски'
}

function boardGroupKey(item: ChangeRequest) {
  if (item.boardId?.trim()) return `board:${item.boardId.trim()}`
  if (item.areaPath?.trim()) return `area:${item.areaPath.trim()}`
  return 'none'
}

export function buildClosedDeliveriesByBoard(
  items: ChangeRequest[],
  highlightBoardIds: string[],
  maxBars = 10,
): MetricBarPoint[] {
  const highlightIds = new Set(highlightBoardIds)
  const counts = new Map<string, { value: number; highlight: boolean; label: string }>()
  for (const item of items) {
    const key = boardGroupKey(item)
    const label = boardLabel(item)
    const highlighted = Boolean(item.boardId && highlightIds.has(item.boardId))
    const prev = counts.get(key) ?? { value: 0, highlight: false, label }
    let closedInItem = 0
    for (const requirement of item.requirements) {
      if (isRequirementClosed(requirement)) closedInItem += 1
    }
    if (!closedInItem) continue
    counts.set(key, {
      label,
      value: prev.value + closedInItem,
      highlight: prev.highlight || highlighted,
    })
  }
  return [...counts.values()]
    .map((meta) => ({
      label: meta.label,
      value: meta.value,
      highlight: meta.highlight,
      sortKey: meta.value,
    }))
    .sort((left, right) => right.sortKey - left.sortKey || left.label.localeCompare(right.label, 'ru'))
    .slice(0, maxBars)
}

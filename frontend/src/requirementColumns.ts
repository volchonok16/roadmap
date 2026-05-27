import { columnNameFilterKey, isColumnKeyVisible } from './kanbanColumns'
import type { LinkedError, Requirement } from './roadmapTypes'

/**
 * Порядок колонок на доске «Требования» / «Ошибка» в TFS (слева → справа).
 */
export const requirementColumnOrder = [
  'Backlog',
  'Full Analysis',
  'Requirement Review',
  'Development Backlog',
  'Development',
  'Code Review Backlog',
  'Code Review',
  'Test Backlog',
  'Test',
  'Test Review',
  'Acceptance',
  'Merge-Backlog',
  'Merge',
  'Closed',
  'New',
  'Merged',
]

const requirementColumnAliases: Record<string, string> = {
  'requirement review': 'Requirement Review',
  'code review backlog': 'Code Review Backlog',
  'code-review backlog': 'Code Review Backlog',
  'code review': 'Code Review',
  'code-review': 'Code Review',
  'test backlog': 'Test Backlog',
  'test review': 'Test Review',
  'merge-backlog': 'Merge-Backlog',
  'merge backlog': 'Merge-Backlog',
  merged: 'Merge',
  '11. closed': 'Closed',
  'arch/full analysis': 'Full Analysis',
  'analysis backlog': 'Full Analysis',
  done: 'Closed',
  resolved: 'Closed',
  fixed: 'Closed',
  complete: 'Closed',
  completed: 'Closed',
}

export function normalizeRequirementColumn(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return trimmed
  const alias = requirementColumnAliases[trimmed.toLowerCase()]
  if (alias) return alias
  const exact = requirementColumnOrder.find((item) => item.toLowerCase() === trimmed.toLowerCase())
  return exact ?? trimmed
}

export function requirementColumnLabel(requirement: Requirement) {
  const raw = requirement.column?.trim() || requirement.state
  return normalizeRequirementColumn(raw)
}

export function linkedErrorColumnLabel(error: LinkedError) {
  const raw = error.column?.trim() || error.state?.trim() || '—'
  return normalizeRequirementColumn(raw)
}

export function isRequirementColumnVisible(column: string, hiddenColumnKeys: string[]) {
  const normalized = normalizeRequirementColumn(column)
  return isColumnKeyVisible(columnNameFilterKey(normalized), hiddenColumnKeys)
}

export function isRequirementLikeColumnVisible(
  item: { column?: string | null; state: string },
  hiddenColumnKeys: string[],
) {
  const raw = item.column?.trim() || item.state?.trim() || '—'
  return isRequirementColumnVisible(raw, hiddenColumnKeys)
}

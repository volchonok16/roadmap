import { columnNameFilterKey, isColumnKeyVisible, zniColumnOrder } from './kanbanColumns'
import type { LinkedError, Requirement } from './roadmapTypes'

/**
 * Порядок колонок доски «Требование» / «Ошибка» (слева → справа на шкале ЗНИ).
 * New — первая колонка, Closed — последняя.
 */
export const requirementColumnOrder = [
  'New',
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
  'Merged',
  'Closed',
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

function zniFallbackSortIndex(label: string) {
  const normalized = label.trim()
  const exact = zniColumnOrder.findIndex((item) => item.toLowerCase() === normalized.toLowerCase())
  if (exact >= 0) return exact
  const lower = normalized.toLowerCase()
  if (lower.includes('new')) return 0
  if (lower.includes('closed') || lower.includes('done') || lower.includes('merged')) {
    return zniColumnOrder.length - 1
  }
  if (lower.includes('pilot')) return zniColumnOrder.indexOf('Pilot')
  if (lower.includes('uat') || lower.includes('test')) return zniColumnOrder.indexOf('UAT')
  if (lower.includes('develop') || lower.includes('code-review')) return zniColumnOrder.indexOf('Development')
  if (lower.includes('express')) return zniColumnOrder.indexOf('Express Analysis')
  if (lower.includes('architecture')) return zniColumnOrder.indexOf('Analysis')
  if (lower.includes('backlog') && lower.includes('analysis')) return zniColumnOrder.indexOf('Analysis Backlog')
  if (lower.includes('backlog')) return zniColumnOrder.indexOf('Backlog')
  if (lower.includes('analysis') || lower.includes('analyt') || lower.includes('review')) {
    return zniColumnOrder.indexOf('Analysis')
  }
  return zniColumnOrder.length
}

/** Индекс колонки для сортировки строк и положения маркера на шкале (0 = New слева). */
export function requirementColumnSortIndex(label: string) {
  const normalized = normalizeRequirementColumn(label)
  const exact = requirementColumnOrder.findIndex(
    (item) => item.toLowerCase() === normalized.toLowerCase(),
  )
  if (exact >= 0) return exact

  const lower = normalized.toLowerCase()
  if (lower === 'new' || lower.startsWith('new ')) return requirementColumnOrder.indexOf('New')
  if (lower.includes('accept')) return requirementColumnOrder.indexOf('Acceptance')
  if (lower.includes('merge') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Merge-Backlog')
  if (lower.includes('merge')) return requirementColumnOrder.indexOf('Merge')
  if (lower.includes('test') && lower.includes('review')) return requirementColumnOrder.indexOf('Test Review')
  if (lower.includes('test') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Test Backlog')
  if (lower === 'test' || lower.startsWith('test ')) return requirementColumnOrder.indexOf('Test')
  if (lower.includes('code') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Code Review Backlog')
  if (lower.includes('code') && lower.includes('review')) return requirementColumnOrder.indexOf('Code Review')
  if (lower.includes('develop') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Development Backlog')
  if (lower.includes('develop')) return requirementColumnOrder.indexOf('Development')
  if (lower.includes('requirement') && lower.includes('review')) {
    return requirementColumnOrder.indexOf('Requirement Review')
  }
  if (lower.includes('full') && lower.includes('analysis')) return requirementColumnOrder.indexOf('Full Analysis')
  if (lower.includes('backlog')) return requirementColumnOrder.indexOf('Backlog')
  if (lower.includes('closed')) return requirementColumnOrder.indexOf('Closed')
  return requirementColumnOrder.length + zniFallbackSortIndex(normalized)
}

/** Доля слева→справа внутри срока ЗНИ (0 = New, 1 = Closed). */
export function requirementStatusLaneFraction(label: string) {
  const maxIdx = Math.max(requirementColumnOrder.length - 1, 1)
  const index = requirementColumnSortIndex(label)
  return Math.min(Math.max(index / maxIdx, 0), 1)
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

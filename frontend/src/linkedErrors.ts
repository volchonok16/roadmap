import { isRequirementLikeColumnVisible, linkedErrorColumnLabel } from './requirementColumns'
import type { ChangeRequest, LinkedError, Requirement } from './roadmapTypes'

export { linkedErrorColumnLabel } from './requirementColumns'

export function isLinkedError(value: unknown): value is LinkedError {
  if (!value || typeof value !== 'object') return false
  const row = value as LinkedError
  return typeof row.id === 'number' && typeof row.title === 'string' && typeof row.state === 'string'
}

export function normalizeLinkedErrors(list: LinkedError[] | undefined | null): LinkedError[] {
  if (!Array.isArray(list) || !list.length) return []
  return list.filter(isLinkedError)
}

export function normalizeRequirement(requirement: Requirement): Requirement {
  return {
    ...requirement,
    errors: normalizeLinkedErrors(requirement.errors),
  }
}

/** Подготовка roadmap: всегда errors: [], без битых записей. */
export function normalizeChangeRequest(item: ChangeRequest): ChangeRequest {
  const requirements = (item.requirements ?? []).map(normalizeRequirement)
  const requirementErrorIds = new Set<number>()
  for (const requirement of requirements) {
    for (const error of requirement.errors ?? []) {
      requirementErrorIds.add(error.id)
    }
  }
  const zniErrors = normalizeLinkedErrors(item.errors).filter((error) => !requirementErrorIds.has(error.id))
  return {
    ...item,
    requirements,
    errors: zniErrors,
  }
}

export function normalizeRoadmapItems(items: ChangeRequest[]): ChangeRequest[] {
  return items.map(normalizeChangeRequest)
}

export function errorStatusLabel(error: LinkedError): string {
  const raw = error.column?.trim() || error.state?.trim() || '—'
  return raw
}

export function visibleLinkedErrors(
  errors: LinkedError[] | undefined | null,
  hiddenColumnKeys: string[],
): LinkedError[] {
  return normalizeLinkedErrors(errors).filter((error) => isRequirementLikeColumnVisible(error, hiddenColumnKeys))
}

export function linkedErrorsForRequirement(
  requirement: Requirement,
  hiddenColumnKeys: string[] = [],
): LinkedError[] {
  return visibleLinkedErrors(requirement.errors, hiddenColumnKeys)
}

export function linkedErrorsForChangeRequest(
  item: ChangeRequest,
  hiddenColumnKeys: string[] = [],
): LinkedError[] {
  return visibleLinkedErrors(item.errors, hiddenColumnKeys)
}

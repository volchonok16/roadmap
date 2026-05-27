import { requirementColumnLabel } from './requirementColumns'
import type { ChangeRequest } from './roadmapTypes'

export function isRequirementClosed(requirement: ChangeRequest['requirements'][number]) {
  return requirementColumnLabel(requirement) === 'Closed'
}

export function countClosedRequirements(items: ChangeRequest[]) {
  let total = 0
  for (const item of items) {
    for (const requirement of item.requirements) {
      if (isRequirementClosed(requirement)) total += 1
    }
  }
  return total
}

export function countStreams(boardCount: number) {
  return boardCount
}

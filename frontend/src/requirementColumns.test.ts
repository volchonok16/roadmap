import { describe, expect, it } from 'vitest'
import {
  requirementColumnSortIndex,
  requirementStatusLaneFraction,
} from './requirementColumns'

describe('requirementColumnSortIndex', () => {
  it('places New left of Development, Merge, and Closed', () => {
    const newIdx = requirementColumnSortIndex('New')
    const devIdx = requirementColumnSortIndex('Development')
    const mergeIdx = requirementColumnSortIndex('Merge')
    const closedIdx = requirementColumnSortIndex('Closed')
    expect(newIdx).toBeLessThan(devIdx)
    expect(devIdx).toBeLessThan(mergeIdx)
    expect(mergeIdx).toBeLessThan(closedIdx)
  })

  it('maps lane fractions along the same order', () => {
    expect(requirementStatusLaneFraction('New')).toBeLessThan(requirementStatusLaneFraction('Development'))
    expect(requirementStatusLaneFraction('Development')).toBeLessThan(
      requirementStatusLaneFraction('Merge'),
    )
    expect(requirementStatusLaneFraction('Merge')).toBeLessThan(requirementStatusLaneFraction('Closed'))
  })
})

import { describe, expect, it } from 'vitest'
import { countClosedRequirements } from './metricsSummary'
import type { ChangeRequest } from './roadmapTypes'

describe('countClosedRequirements', () => {
  it('counts requirements in Closed column or state', () => {
    const items: ChangeRequest[] = [
      {
        id: 1,
        title: 'ZNI',
        state: 'Dev',
        startDate: '2026-01-01',
        targetDate: '2026-06-01',
        requirements: [
          { id: 10, title: 'A', state: 'Closed', column: 'Closed' },
          { id: 11, title: 'B', state: 'Development' },
          { id: 12, title: 'C', state: 'Done' },
        ],
      },
    ]
    expect(countClosedRequirements(items)).toBe(2)
  })
})

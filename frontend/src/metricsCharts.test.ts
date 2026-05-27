import { describe, expect, it } from 'vitest'
import { buildClosedDeliveriesByRelease, buildClosedDeliveriesByTeam } from './metricsCharts'
import type { ChangeRequest } from './roadmapTypes'

const baseZni: ChangeRequest = {
  id: 1,
  title: 'ZNI',
  state: 'Dev',
  boardId: 'board-a',
  boardName: 'Digital Streams Service',
  startDate: '2026-01-01',
  targetDate: '2026-06-01',
  requirements: [],
}

describe('buildClosedDeliveriesByRelease', () => {
  it('groups closed requirements by release label', () => {
    const items: ChangeRequest[] = [
      {
        ...baseZni,
        requirements: [
          { id: 1, title: 'A', state: 'Closed', release: '2026.06.02.0-R' },
          { id: 2, title: 'B', state: 'Closed', release: '2026.06.02.0-R' },
          { id: 3, title: 'C', state: 'Closed', release: '2026.06.16.0-R' },
        ],
      },
    ]
    const series = buildClosedDeliveriesByRelease(items)
    expect(series.map((row) => [row.label, row.value])).toEqual([
      ['2026.06.02.0-R', 2],
      ['2026.06.16.0-R', 1],
    ])
  })
})

describe('buildClosedDeliveriesByTeam', () => {
  it('groups closed requirements by board and highlights selected teams', () => {
    const items: ChangeRequest[] = [
      {
        ...baseZni,
        requirements: [{ id: 1, title: 'A', state: 'Closed' }],
      },
      {
        ...baseZni,
        id: 2,
        boardId: 'board-b',
        boardName: 'Digital Streams eCommerce',
        requirements: [
          { id: 2, title: 'B', state: 'Closed' },
          { id: 3, title: 'C', state: 'Closed' },
        ],
      },
    ]
    const series = buildClosedDeliveriesByTeam(items, ['board-a'])
    expect(series[0].label).toBe('Digital Streams eCommerce')
    expect(series[0].value).toBe(2)
    expect(series.find((row) => row.label === 'Digital Streams Service')?.highlight).toBe(true)
  })
})

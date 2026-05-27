import { describe, expect, it } from 'vitest'
import {
  buildShippedTasksByRelease,
  collectReleaseSchedule,
  releaseWindowForClosedDate,
} from './metricsCharts'
import type { ChangeRequest } from './roadmapTypes'

function localDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const baseZni: ChangeRequest = {
  id: 1,
  title: 'ZNI',
  state: 'Dev',
  startDate: '2026-01-01',
  targetDate: '2026-07-01',
  requirements: [],
}

describe('collectReleaseSchedule', () => {
  it('collects sorted unique release labels', () => {
    const items: ChangeRequest[] = [
      {
        ...baseZni,
        release: '2026.06.16.0-R',
        requirements: [{ id: 1, title: 'A', state: 'Closed', release: '2026.06.02.0-R' }],
      },
    ]
    expect(collectReleaseSchedule(items).map((row) => row.label)).toEqual([
      '2026.06.02.0-R',
      '2026.06.16.0-R',
    ])
  })
})

describe('releaseWindowForClosedDate', () => {
  const schedule = collectReleaseSchedule([
    {
      ...baseZni,
      requirements: [
        { id: 1, title: 'A', state: 'Closed', release: '2026.06.02.0-R' },
        { id: 2, title: 'B', state: 'Closed', release: '2026.06.16.0-R' },
      ],
    },
  ])

  it('assigns early close before next release date to upcoming release window', () => {
    const periodStart = localDate('2026-01-01')
    expect(releaseWindowForClosedDate(localDate('2026-06-10'), schedule, periodStart)).toBe(
      '2026.06.16.0-R',
    )
    expect(releaseWindowForClosedDate(localDate('2026-06-02'), schedule, periodStart)).toBe(
      '2026.06.02.0-R',
    )
    expect(releaseWindowForClosedDate(localDate('2026-05-28'), schedule, periodStart)).toBe(
      '2026.06.02.0-R',
    )
  })
})

describe('buildShippedTasksByRelease', () => {
  it('counts closed requirements only by linked TFS release field', () => {
    const items: ChangeRequest[] = [
      {
        ...baseZni,
        requirements: [
          {
            id: 1,
            title: 'A',
            state: 'Closed',
            release: '2026.06.16.0-R',
            closedDate: '2026-06-10T12:00:00Z',
          },
          {
            id: 2,
            title: 'B',
            state: 'Closed',
            release: '2026.06.16.0-R',
            closedDate: '2026-06-01T12:00:00Z',
          },
          {
            id: 3,
            title: 'C',
            state: 'Closed',
            closedDate: '2026-06-20T12:00:00Z',
          },
        ],
      },
    ]
    const series = buildShippedTasksByRelease(items, localDate('2026-01-01'), { includeEmptyBars: false })
    expect(series.find((row) => row.label === '2026.06.16.0-R')?.value).toBe(2)
    expect(series.find((row) => row.label === 'Без релиза')?.value).toBe(1)
    expect(series.find((row) => row.label === '2026.06.02.0-R')).toBeUndefined()
  })
})

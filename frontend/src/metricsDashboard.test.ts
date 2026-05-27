import { describe, expect, it } from 'vitest'
import { buildHistogramFromShipments, nextUpcomingRelease, releasesForHistogram } from './metricsDashboard'

describe('releasesForHistogram', () => {
  it('includes past releases and only the nearest future one', () => {
    const today = new Date(2026, 4, 26)
    const releases = [
      { label: '2026.05.21.0-R', date: '2026-05-21' },
      { label: '2026.06.02.0-R', date: '2026-06-02' },
      { label: '2026.12.01.0-R', date: '2026-12-01' },
    ]
    expect(releasesForHistogram(releases, today).map((r) => r.label)).toEqual([
      '2026.05.21.0-R',
      '2026.06.02.0-R',
    ])
    expect(nextUpcomingRelease(releases, today)?.label).toBe('2026.06.02.0-R')
  })
})

describe('buildHistogramFromShipments', () => {
  it('builds series for selected board from pre-aggregated shipments', () => {
    const releases = [
      { label: '2026.06.02.0-R', date: '2026-06-02' },
      { label: '2026.06.16.0-R', date: '2026-06-16' },
    ]
    const shipments = [
      {
        boardId: 'a',
        boardName: 'Service',
        releaseLabel: '2026.06.02.0-R',
        releaseDate: '2026-06-02',
        count: 3,
      },
      {
        boardId: 'a',
        boardName: 'Service',
        releaseLabel: '2026.06.16.0-R',
        releaseDate: '2026-06-16',
        count: 5,
      },
    ]
    const series = buildHistogramFromShipments(shipments, releases, {
      includeEmptyBars: true,
      today: new Date(2026, 5, 30),
    })
    expect(series.find((row) => row.label === '2026.06.16.0-R')?.value).toBe(5)
  })

  it('shows next release with zero count when includeEmptyBars is false', () => {
    const today = new Date(2026, 4, 26)
    const releases = [
      { label: '2026.05.21.0-R', date: '2026-05-21' },
      { label: '2026.06.02.0-R', date: '2026-06-02' },
      { label: '2026.06.16.0-R', date: '2026-06-16' },
    ]
    const shipments = [
      {
        boardId: 'a',
        boardName: 'Service',
        releaseLabel: '2026.05.21.0-R',
        releaseDate: '2026-05-21',
        count: 10,
      },
    ]
    const series = buildHistogramFromShipments(shipments, releases, {
      includeEmptyBars: false,
      today,
    })
    expect(series.find((row) => row.label === '2026.06.02.0-R')).toEqual({
      label: '2026.06.02.0-R',
      value: 0,
      sortKey: new Date('2026-06-02').getTime(),
    })
    expect(series.some((row) => row.label === '2026.06.16.0-R')).toBe(false)
  })
})

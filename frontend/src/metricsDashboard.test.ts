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

const makeShipment = (
  boardId: string,
  boardName: string,
  releaseLabel: string,
  releaseDate: string,
  count: number,
  reqTotal = 0,
  errorCount = 0,
) => ({ boardId, boardName, releaseLabel, releaseDate, count, reqTotal, errorCount })

describe('buildHistogramFromShipments', () => {
  it('builds multi-series for selected board from pre-aggregated shipments', () => {
    const releases = [
      { label: '2026.06.02.0-R', date: '2026-06-02' },
      { label: '2026.06.16.0-R', date: '2026-06-16' },
    ]
    const shipments = [
      makeShipment('a', 'Service', '2026.06.02.0-R', '2026-06-02', 3, 7, 1),
      makeShipment('a', 'Service', '2026.06.16.0-R', '2026-06-16', 5, 12, 2),
    ]
    const data = buildHistogramFromShipments(shipments, releases, {
      includeEmptyBars: true,
      today: new Date(2026, 5, 30),
    })
    const point = data.points.find((p) => p.label === '2026.06.16.0-R')
    expect(point?.shipped).toBe(5)
    expect(point?.total).toBe(12)
    expect(point?.errors).toBe(2)
  })

  it('shows next release with zero when includeEmptyBars is false', () => {
    const today = new Date(2026, 4, 26)
    const releases = [
      { label: '2026.05.21.0-R', date: '2026-05-21' },
      { label: '2026.06.02.0-R', date: '2026-06-02' },
      { label: '2026.06.16.0-R', date: '2026-06-16' },
    ]
    const shipments = [makeShipment('a', 'Service', '2026.05.21.0-R', '2026-05-21', 10, 15, 3)]
    const data = buildHistogramFromShipments(shipments, releases, {
      includeEmptyBars: false,
      today,
    })
    const next = data.points.find((p) => p.label === '2026.06.02.0-R')
    expect(next).toBeDefined()
    expect(next?.shipped).toBe(0)
    expect(next?.total).toBe(0)
    expect(data.points.some((p) => p.label === '2026.06.16.0-R')).toBe(false)
  })

  it('collects withoutRelease from "Без релиза" rows', () => {
    const releases = [{ label: '2026.06.02.0-R', date: '2026-06-02' }]
    const shipments = [
      makeShipment('a', 'S', '2026.06.02.0-R', '2026-06-02', 3, 5, 1),
      makeShipment('a', 'S', 'Без релиза', '', 4, 0, 2),
    ]
    const data = buildHistogramFromShipments(shipments, releases, { today: new Date(2026, 5, 30) })
    expect(data.withoutRelease.shipped).toBe(4)
    expect(data.withoutRelease.errors).toBe(2)
  })
})

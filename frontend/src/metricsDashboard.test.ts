import { describe, expect, it } from 'vitest'
import { buildHistogramFromShipments } from './metricsDashboard'

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
    const series = buildHistogramFromShipments(shipments, releases, { includeEmptyBars: true })
    expect(series.find((row) => row.label === '2026.06.16.0-R')?.value).toBe(5)
  })
})

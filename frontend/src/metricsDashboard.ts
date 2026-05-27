import type { MetricBarPoint } from './metricsCharts'
import { shortReleaseLabel } from './metricsCharts'

export type MetricsDashboardBoard = {
  id: string
  name: string
}

export type MetricsDashboardRelease = {
  label: string
  date: string | null
}

export type MetricsDashboardShipment = {
  boardId: string | null
  boardName: string
  releaseLabel: string
  releaseDate: string | null
  count: number
}

export type MetricsDashboard = {
  boards: MetricsDashboardBoard[]
  releases: MetricsDashboardRelease[]
  shipments: MetricsDashboardShipment[]
  totals: {
    streams: number
    zniCount: number
    closedRequirements: number
    closedWithoutRelease: number
  }
  periodFrom: string
  periodTo: string
  generatedAt: string
  cacheBuiltAt: string | null
}

export function shipmentsForBoard(shipments: MetricsDashboardShipment[], boardId: string | null) {
  if (!boardId) return shipments
  return shipments.filter((row) => row.boardId === boardId)
}

export function buildHistogramFromShipments(
  shipments: MetricsDashboardShipment[],
  releases: MetricsDashboardRelease[],
  options: { includeEmptyBars?: boolean; maxBars?: number } = {},
): MetricBarPoint[] {
  const maxBars = options.maxBars ?? 16
  const includeEmptyBars = options.includeEmptyBars ?? true
  const counts = new Map<string, number>()
  for (const row of shipments) {
    counts.set(row.releaseLabel, (counts.get(row.releaseLabel) ?? 0) + row.count)
  }

  const ordered = releases
    .map((release) => ({
      label: release.label,
      value: counts.get(release.label) ?? 0,
      sortKey: release.date ? new Date(release.date).getTime() : Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.sortKey - right.sortKey)

  let series = includeEmptyBars ? ordered : ordered.filter((row) => row.value > 0)
  series = series.slice(-maxBars)

  const withoutRelease = shipments
    .filter((row) => row.releaseLabel === 'Без релиза')
    .reduce((acc, row) => acc + row.count, 0)
  if (withoutRelease > 0) {
    series.push({
      label: 'Без релиза',
      value: withoutRelease,
      sortKey: Number.MAX_SAFE_INTEGER - 1,
    })
  }

  return series
}

export function formatReleaseFromDashboard(label: string) {
  if (label === 'Closed без даты') return label
  return shortReleaseLabel(label)
}

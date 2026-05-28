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
    requirementsCount: number
    errorsCount: number
    totalTasksCount: number
  }
  periodFrom: string
  periodTo: string
  generatedAt: string
  cacheBuiltAt: string | null
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function releasesWithSortKey(releases: MetricsDashboardRelease[]) {
  return releases
    .filter((release): release is MetricsDashboardRelease & { date: string } => Boolean(release.date))
    .map((release) => ({
      label: release.label,
      date: release.date,
      sortKey: startOfDay(new Date(release.date)).getTime(),
    }))
    .sort((left, right) => left.sortKey - right.sortKey)
}

/** Ближайший будущий релиз (следующий после сегодня), если есть. */
export function nextUpcomingRelease(releases: MetricsDashboardRelease[], today = new Date()) {
  const todayStart = startOfDay(today).getTime()
  return releasesWithSortKey(releases).find((release) => release.sortKey > todayStart) ?? null
}

/** Прошедшие и текущие релизы + один ближайший будущий (для шкалы гистограммы). */
export function releasesForHistogram(releases: MetricsDashboardRelease[], today = new Date()) {
  const todayStart = startOfDay(today).getTime()
  const sorted = releasesWithSortKey(releases)
  const past = sorted.filter((release) => release.sortKey <= todayStart)
  const upcoming = sorted.find((release) => release.sortKey > todayStart)
  const picked = upcoming ? [...past, upcoming] : past
  return picked.map(({ label, date }) => ({ label, date }))
}

/** @deprecated используйте releasesForHistogram */
export function releasesUpToToday(releases: MetricsDashboardRelease[], today = new Date()) {
  return releasesForHistogram(releases, today)
}

export function shipmentsForBoard(
  shipments: MetricsDashboardShipment[],
  boardId: string | null,
  boards: MetricsDashboardBoard[] = [],
) {
  if (!boardId) return shipments
  const board = boards.find((item) => item.id === boardId)
  return shipments.filter((row) => {
    if (row.boardId && row.boardId === boardId) return true
    if (board && row.boardName === board.name) return true
    if (boardId.startsWith('area:') && board) {
      return row.boardId === boardId || row.boardName === board.name
    }
    return false
  })
}

export function buildHistogramFromShipments(
  shipments: MetricsDashboardShipment[],
  releases: MetricsDashboardRelease[],
  options: { includeEmptyBars?: boolean; maxBars?: number; today?: Date } = {},
): MetricBarPoint[] {
  const maxBars = options.maxBars ?? 16
  const includeEmptyBars = options.includeEmptyBars ?? true
  const today = options.today ?? new Date()
  const chartReleases = releasesForHistogram(releases, today)
  const nextReleaseLabel = nextUpcomingRelease(releases, today)?.label ?? null

  const counts = new Map<string, number>()
  for (const row of shipments) {
    counts.set(row.releaseLabel, (counts.get(row.releaseLabel) ?? 0) + row.count)
  }

  const ordered = chartReleases
    .map((release) => ({
      label: release.label,
      value: counts.get(release.label) ?? 0,
      sortKey: release.date ? new Date(release.date).getTime() : Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.sortKey - right.sortKey)

  let series = includeEmptyBars
    ? ordered
    : ordered.filter((row) => row.value > 0 || row.label === nextReleaseLabel)
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
  if (label === 'Closed без даты' || label === 'Без релиза') return label
  return shortReleaseLabel(label)
}

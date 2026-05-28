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
  reqTotal: number
  errorCount: number
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
    activeRequirementsCount: number
    activeErrorsCount: number
    activeTotalCount: number
  }
  periodFrom: string
  periodTo: string
  generatedAt: string
  cacheBuiltAt: string | null
}

/** Мульти-серийная точка гистограммы: одна точка = один релиз, 3 значения. */
export type MetricMultiBarPoint = {
  label: string
  sortKey: number
  shipped: number  // синяя: закрытые требования
  total: number    // зелёная: все требования с этим релизом
  errors: number   // красная: закрытые ошибки
}

/** Данные для мульти-серийного графика отгрузки по релизам. */
export type ReleaseHistogramData = {
  points: MetricMultiBarPoint[]  // основная ось (без «Без релиза»)
  withoutRelease: { shipped: number; total: number; errors: number }
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
): ReleaseHistogramData {
  const maxBars = options.maxBars ?? 24
  const includeEmptyBars = options.includeEmptyBars ?? true
  const today = options.today ?? new Date()
  const chartReleases = releasesForHistogram(releases, today)
  const nextReleaseLabel = nextUpcomingRelease(releases, today)?.label ?? null

  const shipped = new Map<string, number>()
  const total = new Map<string, number>()
  const errors = new Map<string, number>()

  for (const row of shipments) {
    if (row.releaseLabel === 'Без релиза') continue
    shipped.set(row.releaseLabel, (shipped.get(row.releaseLabel) ?? 0) + row.count)
    total.set(row.releaseLabel, (total.get(row.releaseLabel) ?? 0) + row.reqTotal)
    errors.set(row.releaseLabel, (errors.get(row.releaseLabel) ?? 0) + row.errorCount)
  }

  let ordered: MetricMultiBarPoint[] = chartReleases.map((release) => ({
    label: release.label,
    sortKey: release.date ? new Date(release.date).getTime() : Number.MAX_SAFE_INTEGER,
    shipped: shipped.get(release.label) ?? 0,
    total: total.get(release.label) ?? 0,
    errors: errors.get(release.label) ?? 0,
  }))

  if (!includeEmptyBars) {
    ordered = ordered.filter(
      (row) => row.shipped > 0 || row.total > 0 || row.errors > 0 || row.label === nextReleaseLabel,
    )
  }
  ordered = ordered.slice(-maxBars)

  const noRelease = shipments.filter((row) => row.releaseLabel === 'Без релиза')
  const withoutRelease = {
    shipped: noRelease.reduce((acc, row) => acc + row.count, 0),
    total: noRelease.reduce((acc, row) => acc + row.reqTotal, 0),
    errors: noRelease.reduce((acc, row) => acc + row.errorCount, 0),
  }

  return { points: ordered, withoutRelease }
}

export function formatReleaseFromDashboard(label: string) {
  if (label === 'Closed без даты' || label === 'Без релиза') return label
  return shortReleaseLabel(label)
}

/** Точка на графике прогресса по релизам: shipped (закрыто), inProgress (в работе), errors (ошибки). */
export type ReleaseProgressPoint = {
  label: string
  sortKey: number
  shipped: number   // закрытые требования
  inProgress: number  // req_total - shipped (ещё в работе)
  errors: number   // закрытые ошибки
}

/** Строит данные для виджета «Прогресс по релизам» из shipments. */
export function buildReleaseProgressPoints(
  shipments: MetricsDashboardShipment[],
  releases: MetricsDashboardRelease[],
  options: { maxBars?: number; today?: Date } = {},
): ReleaseProgressPoint[] {
  const maxBars = options.maxBars ?? 20
  const today = options.today ?? new Date()
  const chartReleases = releasesForHistogram(releases, today)

  const shipped = new Map<string, number>()
  const total = new Map<string, number>()
  const errors = new Map<string, number>()

  for (const row of shipments) {
    if (row.releaseLabel === 'Без релиза') continue
    shipped.set(row.releaseLabel, (shipped.get(row.releaseLabel) ?? 0) + row.count)
    total.set(row.releaseLabel, (total.get(row.releaseLabel) ?? 0) + row.reqTotal)
    errors.set(row.releaseLabel, (errors.get(row.releaseLabel) ?? 0) + row.errorCount)
  }

  const points: ReleaseProgressPoint[] = chartReleases
    .map((release) => {
      const s = shipped.get(release.label) ?? 0
      const t = total.get(release.label) ?? 0
      return {
        label: release.label,
        sortKey: release.date ? new Date(release.date).getTime() : Number.MAX_SAFE_INTEGER,
        shipped: s,
        inProgress: Math.max(0, t - s),
        errors: errors.get(release.label) ?? 0,
      }
    })
    .filter((p) => p.shipped > 0 || p.inProgress > 0)

  return points.slice(-maxBars)
}

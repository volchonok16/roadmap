import type { MetricBarPoint } from './metricsCharts'

export type ShipmentTrend = {
  direction: 'up' | 'down' | 'flat'
  delta: number
  deltaPct: number | null
  lastLabel: string
  prevLabel: string
}

export function releaseSeriesForTrend(series: MetricBarPoint[]) {
  return series
    .filter((row) => row.label !== 'Closed без даты')
    .sort((left, right) => left.sortKey - right.sortKey)
}

export function computeShipmentTrend(series: MetricBarPoint[]): ShipmentTrend | null {
  const ordered = releaseSeriesForTrend(series)
  if (ordered.length < 2) return null
  const last = ordered[ordered.length - 1]
  const prev = ordered[ordered.length - 2]
  const delta = last.value - prev.value
  const deltaPct = prev.value > 0 ? Math.round((delta / prev.value) * 100) : null
  let direction: ShipmentTrend['direction'] = 'flat'
  if (delta > 0) direction = 'up'
  if (delta < 0) direction = 'down'
  return {
    direction,
    delta,
    deltaPct,
    lastLabel: last.label,
    prevLabel: prev.label,
  }
}

export function formatTrendLabel(trend: ShipmentTrend | null) {
  if (!trend) return 'Недостаточно релизов для тренда'
  const sign = trend.delta > 0 ? '+' : ''
  const pct =
    trend.deltaPct === null ? '' : ` (${sign}${trend.deltaPct}%)`
  if (trend.direction === 'up') {
    return `Прогрессия: ${sign}${trend.delta}${pct} к прошлому релизу`
  }
  if (trend.direction === 'down') {
    return `Регрессия: ${trend.delta}${pct} к прошлому релизу`
  }
  return 'Без изменений к прошлому релизу'
}

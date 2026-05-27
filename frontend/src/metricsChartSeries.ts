import type { MetricBarPoint } from './metricsCharts'

export function isTimelineChartPoint(item: MetricBarPoint) {
  return item.label !== 'Без релиза' && item.label !== 'Closed без даты'
}

export function timelineChartSeries(series: MetricBarPoint[]) {
  return series.filter(isTimelineChartPoint).sort((left, right) => left.sortKey - right.sortKey)
}

export function withoutReleaseCount(series: MetricBarPoint[]) {
  return series
    .filter((item) => item.label === 'Без релиза')
    .reduce((acc, item) => acc + item.value, 0)
}

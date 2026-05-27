import { useMemo } from 'react'
import type { MetricBarPoint } from './metricsCharts'
import { computeShipmentTrend, formatTrendLabel } from './metricsTrend'
import { formatReleaseAxisLabel } from './MetricsBarChart'

type MetricsHistogramProps = {
  series: MetricBarPoint[]
  loading?: boolean
  emptyLabel?: string
  valueSuffix?: string
}

function trendPoints(series: MetricBarPoint[], maxValue: number) {
  const ordered = series.filter((row) => row.label !== 'Closed без даты')
  if (ordered.length < 2 || maxValue <= 0) return ''
  const lastIndex = ordered.length - 1
  return ordered
    .map((item, index) => {
      const x = lastIndex === 0 ? 50 : (index / lastIndex) * 100
      const y = 100 - (item.value / maxValue) * 92
      return `${x},${y}`
    })
    .join(' ')
}

export default function MetricsHistogram({
  series,
  loading = false,
  emptyLabel = 'Нет данных',
  valueSuffix = '',
}: MetricsHistogramProps) {
  const trend = useMemo(() => computeShipmentTrend(series), [series])
  const maxValue = Math.max(...series.map((item) => item.value), 1)
  const polyline = useMemo(() => trendPoints(series, maxValue), [series, maxValue])

  if (loading) {
    return <div className="metrics-histogram metrics-histogram-loading">Загрузка…</div>
  }
  if (!series.length) {
    return <div className="metrics-histogram metrics-histogram-empty">{emptyLabel}</div>
  }

  return (
    <div className="metrics-histogram" role="img" aria-label="Гистограмма отгрузки по релизам">
      <div className={`metrics-histogram-trend-badge is-${trend?.direction ?? 'flat'}`}>
        {formatTrendLabel(trend)}
      </div>
      <div className="metrics-histogram-plot">
        {polyline ? (
          <svg
            className={`metrics-histogram-trend-line is-${trend?.direction ?? 'flat'}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline points={polyline} />
          </svg>
        ) : null}
        <div className="metrics-histogram-bars">
          {series.map((item) => {
            const heightPct = item.value === 0 ? 2 : Math.max((item.value / maxValue) * 100, 6)
            const label = formatReleaseAxisLabel(item.label)
            return (
              <div
                key={item.label}
                className={`metrics-histogram-col ${item.value === 0 ? 'is-empty' : ''}`}
              >
                <span className="metrics-histogram-value" title={`${item.value}${valueSuffix}`}>
                  {item.value}
                </span>
                <div
                  className="metrics-histogram-bar"
                  style={{ height: `${heightPct}%` }}
                  title={`${label}: ${item.value}${valueSuffix}`}
                />
                <span className="metrics-histogram-label" title={label}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

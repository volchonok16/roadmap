import type { MetricBarPoint } from './metricsCharts'
import { formatReleaseAxisLabel } from './MetricsBarChart'

type MetricsHistogramProps = {
  series: MetricBarPoint[]
  loading?: boolean
  emptyLabel?: string
  valueSuffix?: string
}

export default function MetricsHistogram({
  series,
  loading = false,
  emptyLabel = 'Нет данных',
  valueSuffix = '',
}: MetricsHistogramProps) {
  if (loading) {
    return <div className="metrics-histogram metrics-histogram-loading">Загрузка…</div>
  }
  if (!series.length) {
    return <div className="metrics-histogram metrics-histogram-empty">{emptyLabel}</div>
  }

  const maxValue = Math.max(...series.map((item) => item.value), 1)

  return (
    <div className="metrics-histogram" role="img" aria-label="Гистограмма отгрузки по релизам">
      <div className="metrics-histogram-bars">
        {series.map((item) => {
          const heightPct = item.value === 0 ? 3 : Math.max((item.value / maxValue) * 100, 8)
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
  )
}

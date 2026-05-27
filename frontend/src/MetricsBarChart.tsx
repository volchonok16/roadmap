import type { MetricBarPoint } from './metricsCharts'
import { shortReleaseLabel } from './metricsCharts'

type MetricsBarChartProps = {
  series: MetricBarPoint[]
  loading?: boolean
  emptyLabel?: string
  formatLabel?: (label: string) => string
  valueSuffix?: string
  variant?: 'default' | 'release'
}

export default function MetricsBarChart({
  series,
  loading = false,
  emptyLabel = 'Нет данных',
  formatLabel,
  valueSuffix = '',
  variant = 'default',
}: MetricsBarChartProps) {
  if (loading) {
    return <div className="metrics-bar-chart metrics-bar-chart-loading">Загрузка…</div>
  }
  if (!series.length) {
    return <div className="metrics-bar-chart metrics-bar-chart-empty">{emptyLabel}</div>
  }

  const maxValue = Math.max(...series.map((item) => item.value), 1)
  const labelFor = formatLabel ?? ((label: string) => label)

  return (
    <div className="metrics-bar-chart" role="img" aria-label="Столбчатая диаграмма">
      <div className="metrics-bar-chart-plot">
        {series.map((item) => {
          const heightPct = Math.max((item.value / maxValue) * 100, 6)
          return (
            <div
              key={item.label}
              className={`metrics-bar-chart-col ${item.highlight ? 'is-highlight' : ''}`}
            >
              <span className="metrics-bar-chart-value" title={`${item.value}${valueSuffix}`}>
                {item.value}
              </span>
              <div
                className="metrics-bar-chart-bar"
                style={{ height: `${heightPct}%` }}
                title={`${labelFor(item.label)}: ${item.value}${valueSuffix}`}
              />
              <span className="metrics-bar-chart-label" title={labelFor(item.label)}>
                {labelFor(item.label)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function formatReleaseAxisLabel(label: string) {
  if (label === 'Без релиза') return label
  return shortReleaseLabel(label)
}

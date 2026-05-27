import type { MetricBarPoint } from './metricsCharts'

export function formatReleaseAxisLabel(label: string) {
  if (label === 'Closed без даты' || label === 'Без релиза') return label
  const match = label.match(/^(\d{4})\.(\d{2})\.(\d{2})/)
  if (!match) return label.length > 10 ? `${label.slice(0, 10)}…` : label
  return `${match[3]}.${match[2]}`
}

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
    <div
      className={`metrics-bar-chart ${variant === 'release' ? 'metrics-bar-chart-release' : ''}`}
      role="img"
      aria-label="Столбчатая диаграмма"
    >
      <div className="metrics-bar-chart-plot">
        {series.map((item) => {
          const heightPct = item.value === 0 ? 4 : Math.max((item.value / maxValue) * 100, 6)
          return (
            <div
              key={item.label}
              className={`metrics-bar-chart-col ${item.highlight ? 'is-highlight' : ''} ${item.value === 0 ? 'is-empty' : ''}`}
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

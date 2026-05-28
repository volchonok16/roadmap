import type { ReleaseHistogramData } from './metricsDashboard'

export function formatReleaseAxisLabel(label: string) {
  if (label === 'Closed без даты' || label === 'Без релиза') return label
  const match = label.match(/^(\d{4})\.(\d{2})\.(\d{2})/)
  if (!match) return label.length > 10 ? `${label.slice(0, 10)}…` : label
  return `${match[3]}.${match[2]}`
}

const BAR_DEFS = [
  { key: 'total' as const, colorClass: 'is-green', title: 'Всего требований' },
  { key: 'shipped' as const, colorClass: 'is-blue', title: 'Закрыто требований' },
  { key: 'errors' as const, colorClass: 'is-red', title: 'Закрыто ошибок' },
]

type MetricsBarChartProps = {
  data: ReleaseHistogramData
  loading?: boolean
  emptyLabel?: string
  formatLabel?: (label: string) => string
  valueSuffix?: string
}

export default function MetricsBarChart({
  data,
  loading = false,
  emptyLabel = 'Нет данных',
  formatLabel,
  valueSuffix = '',
}: MetricsBarChartProps) {
  if (loading) {
    return <div className="metrics-bar-chart metrics-bar-chart-loading">Загрузка…</div>
  }

  const points = [...data.points].sort((a, b) => a.sortKey - b.sortKey)
  if (!points.length) {
    return <div className="metrics-bar-chart metrics-bar-chart-empty">{emptyLabel}</div>
  }

  const maxValue = Math.max(...points.flatMap((p) => [p.total, p.shipped, p.errors]), 1)
  const labelFor = formatLabel ?? formatReleaseAxisLabel

  return (
    <div
      className="metrics-bar-chart metrics-bar-chart-release metrics-bar-chart-multi"
      role="img"
      aria-label="Столбчатая диаграмма"
    >
      {/* Легенда */}
      <div className="metrics-bar-chart-legend">
        {BAR_DEFS.map((def) => (
          <span key={def.key} className={`metrics-bar-chart-legend-item ${def.colorClass}`}>
            <span className="metrics-bar-chart-legend-dot" />
            {def.title}
          </span>
        ))}
      </div>

      <div className="metrics-bar-chart-plot">
        {points.map((item) => {
          const maxLocal = Math.max(item.total, item.shipped, item.errors, 1)
          return (
            <div key={item.label} className="metrics-bar-chart-col metrics-bar-chart-col-multi">
              <div className="metrics-bar-chart-bars-group">
                {BAR_DEFS.map(({ key, colorClass, title }) => {
                  const value = item[key]
                  const heightPct = value === 0 ? 3 : Math.max((value / maxValue) * 100, 5)
                  return (
                    <div
                      key={key}
                      className={`metrics-bar-chart-bar ${colorClass} ${value === 0 ? 'is-empty' : ''}`}
                      style={{ height: `${heightPct}%` }}
                      title={`${title}: ${value}${valueSuffix}\n${labelFor(item.label)}`}
                    >
                      {value > 0 ? (
                        <span className="metrics-bar-chart-bar-value">{value}</span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
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

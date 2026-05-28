import type { ReleaseProgressPoint } from './metricsDashboard'
import { formatReleaseAxisLabel } from './MetricsBarChart'

/** Стековая диаграмма прогресса по релизам: зелёный = закрыто, серый = в работе. */

type Props = {
  points: ReleaseProgressPoint[]
  loading?: boolean
  emptyLabel?: string
  formatLabel?: (label: string) => string
}

export default function MetricsProgressChart({
  points,
  loading = false,
  emptyLabel = 'Нет данных',
  formatLabel,
}: Props) {
  if (loading) {
    return <div className="metrics-bar-chart metrics-bar-chart-loading">Загрузка…</div>
  }

  const sorted = [...points].sort((a, b) => a.sortKey - b.sortKey)

  if (!sorted.length) {
    return <div className="metrics-bar-chart metrics-bar-chart-empty">{emptyLabel}</div>
  }

  const maxTotal = Math.max(...sorted.map((p) => p.shipped + p.inProgress), 1)
  const labelFor = formatLabel ?? formatReleaseAxisLabel

  return (
    <div
      className="metrics-bar-chart metrics-bar-chart-progress"
      role="img"
      aria-label="Прогресс по релизам"
    >
      <div className="metrics-bar-chart-legend">
        <span className="metrics-bar-chart-legend-item is-green">
          <span className="metrics-bar-chart-legend-dot" />
          Закрыто требований
        </span>
        <span className="metrics-bar-chart-legend-item is-gray">
          <span className="metrics-bar-chart-legend-dot" />
          В работе
        </span>
        <span className="metrics-bar-chart-legend-item is-red">
          <span className="metrics-bar-chart-legend-dot" />
          Закрыто ошибок
        </span>
      </div>

      <div className="metrics-bar-chart-plot">
        {sorted.map((item) => {
          const barTotal = item.shipped + item.inProgress
          const heightPct = barTotal === 0 ? 5 : Math.max((barTotal / maxTotal) * 100, 4)
          const shippedPct = barTotal === 0 ? 0 : (item.shipped / barTotal) * 100
          const inProgressPct = 100 - shippedPct
          const pct = barTotal > 0 ? Math.round((item.shipped / barTotal) * 100) : 0

          return (
            <div key={item.label} className="metrics-bar-chart-col">
              <div
                className="metrics-progress-bar-wrap"
                style={{ height: `${heightPct}%` }}
                title={`${labelFor(item.label)}\nЗакрыто: ${item.shipped} (${pct}%)\nВ работе: ${item.inProgress}\nОшибок: ${item.errors}`}
              >
                <div
                  className="metrics-progress-bar-segment is-green"
                  style={{ height: `${shippedPct}%` }}
                >
                  {item.shipped > 0 && shippedPct > 12 ? (
                    <span className="metrics-bar-chart-bar-value">{item.shipped}</span>
                  ) : null}
                </div>
                <div
                  className="metrics-progress-bar-segment is-gray"
                  style={{ height: `${inProgressPct}%` }}
                >
                  {item.inProgress > 0 && inProgressPct > 12 ? (
                    <span className="metrics-bar-chart-bar-value">{item.inProgress}</span>
                  ) : null}
                </div>
              </div>
              {item.errors > 0 && (
                <div
                  className="metrics-progress-error-dot"
                  title={`Ошибок: ${item.errors}`}
                >
                  {item.errors}
                </div>
              )}
              <span className="metrics-bar-chart-label" title={item.label}>
                {labelFor(item.label)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

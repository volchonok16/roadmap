import type { MetricsRequirementReworkBoard } from './metricsDashboard'

type Props = {
  rows: MetricsRequirementReworkBoard[]
  loading?: boolean
  emptyLabel?: string
}

export default function MetricsReworkChart({
  rows,
  loading = false,
  emptyLabel = 'Нет возвратов в Develop',
}: Props) {
  if (loading) {
    return <div className="metrics-bar-chart metrics-bar-chart-loading">Загрузка…</div>
  }

  const points = [...rows].sort((left, right) => right.count - left.count)
  if (!points.length) {
    return <div className="metrics-bar-chart metrics-bar-chart-empty">{emptyLabel}</div>
  }

  const maxValue = Math.max(...points.map((row) => row.count), 1)

  return (
    <div className="metrics-bar-chart metrics-rework-chart" role="img" aria-label="Возвраты требований в Develop">
      <div className="metrics-bar-chart-legend">
        <span className="metrics-bar-chart-legend-item is-purple">
          <span className="metrics-bar-chart-legend-dot" />
          Возвраты из тестирования в Develop
        </span>
      </div>

      <div className="metrics-bar-chart-plot">
        {points.map((item) => {
          const heightPct = item.count === 0 ? 5 : Math.max((item.count / maxValue) * 100, 6)
          return (
            <div key={item.boardId ?? item.boardName} className="metrics-bar-chart-col metrics-rework-chart-col">
              <div
                className="metrics-bar-chart-bar is-purple"
                style={{ height: `${heightPct}%` }}
                title={`${item.boardName}\nВозвратов в Develop: ${item.count}`}
              >
                <span className="metrics-bar-chart-bar-value">{item.count}</span>
              </div>
              <span className="metrics-bar-chart-label" title={item.boardName}>
                {item.boardName.length > 16 ? `${item.boardName.slice(0, 16)}…` : item.boardName}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

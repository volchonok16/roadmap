import type { MetricsAnalysisBoard } from './metricsDashboard'

type Props = {
  rows: MetricsAnalysisBoard[]
  loading?: boolean
  emptyLabel?: string
}

export default function MetricsAnalysisStayChart({
  rows,
  loading = false,
  emptyLabel = 'Нет ЗНИ в анализе',
}: Props) {
  if (loading) {
    return <div className="metrics-bar-chart metrics-bar-chart-loading">Загрузка…</div>
  }

  const points = [...rows].sort((left, right) => right.avgDays - left.avgDays || right.count - left.count)
  if (!points.length) {
    return <div className="metrics-bar-chart metrics-bar-chart-empty">{emptyLabel}</div>
  }

  const maxValue = Math.max(...points.map((row) => row.avgDays), 1)

  return (
    <div className="metrics-bar-chart metrics-analysis-chart" role="img" aria-label="ЗНИ в анализе по доскам">
      <div className="metrics-bar-chart-legend">
        <span className="metrics-bar-chart-legend-item is-orange">
          <span className="metrics-bar-chart-legend-dot" />
          Среднее дней в анализе
        </span>
        <span className="metrics-bar-chart-legend-item is-gray">
          <span className="metrics-bar-chart-legend-dot" />
          Кол-во ЗНИ
        </span>
      </div>

      <div className="metrics-bar-chart-plot">
        {points.map((item) => {
          const heightPct = item.avgDays === 0 ? 5 : Math.max((item.avgDays / maxValue) * 100, 6)
          return (
            <div key={item.boardId ?? item.boardName} className="metrics-bar-chart-col metrics-analysis-chart-col">
              <div
                className="metrics-bar-chart-bar is-orange"
                style={{ height: `${heightPct}%` }}
                title={`${item.boardName}\nЗНИ: ${item.count}\nСреднее: ${item.avgDays} дн.\nМаксимум: ${item.maxDays} дн.`}
              >
                <span className="metrics-bar-chart-bar-value">{item.avgDays}</span>
              </div>
              <span className="metrics-analysis-chart-count" title={`ЗНИ: ${item.count}`}>
                {item.count}
              </span>
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

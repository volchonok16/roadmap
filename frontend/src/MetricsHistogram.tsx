import { useEffect, useRef, useState } from 'react'
import { formatReleaseAxisLabel } from './MetricsBarChart'
import type { ReleaseHistogramData } from './metricsDashboard'

type MetricsHistogramProps = {
  data: ReleaseHistogramData
  loading?: boolean
  emptyLabel?: string
  valueSuffix?: string
  variant?: 'line' | 'area'
}

const CHART_HEIGHT = 220
const PAD = { top: 28, right: 12, bottom: 32, left: 36 }

const SERIES_DEFS = [
  { key: 'total' as const, colorClass: 'is-green', label: 'Всего требований' },
  { key: 'shipped' as const, colorClass: 'is-blue', label: 'Закрыто требований' },
  { key: 'errors' as const, colorClass: 'is-red', label: 'Закрыто ошибок' },
]

function labelStride(pointCount: number, chartWidth: number) {
  if (pointCount <= 8) return 1
  if (chartWidth < 360) return Math.ceil(pointCount / 4)
  if (chartWidth < 520) return Math.ceil(pointCount / 6)
  if (chartWidth < 720) return Math.ceil(pointCount / 8)
  return 1
}

function buildGeometry(data: ReleaseHistogramData, chartWidth: number) {
  const points = [...data.points].sort((a, b) => a.sortKey - b.sortKey)
  if (!points.length) return null

  const maxValue = Math.max(
    ...points.flatMap((p) => [p.shipped, p.total, p.errors]),
    1,
  )
  const plotW = chartWidth - PAD.left - PAD.right
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom
  const step = points.length > 1 ? plotW / (points.length - 1) : 0
  const stride = labelStride(points.length, chartWidth)

  const getX = (index: number) => PAD.left + (points.length > 1 ? step * index : plotW / 2)
  const getY = (value: number) => PAD.top + plotH - (value / maxValue) * plotH

  const xLabels = points.map((item, index) => ({
    x: getX(index),
    label: formatReleaseAxisLabel(item.label),
    show: index === 0 || index === points.length - 1 || index % stride === 0,
  }))

  const seriesGeom = SERIES_DEFS.map(({ key, colorClass, label }) => {
    const nodes = points.map((item, index) => ({
      x: getX(index),
      y: getY(item[key]),
      value: item[key],
      label: item.label,
    }))
    const linePath = nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n.x} ${n.y}`).join(' ')
    const areaPath = `${linePath} L ${nodes[nodes.length - 1].x} ${PAD.top + plotH} L ${nodes[0].x} ${PAD.top + plotH} Z`
    return { key, colorClass, label, nodes, linePath, areaPath }
  })

  const yTicks = [0, Math.ceil(maxValue / 2), maxValue].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  )

  return { seriesGeom, xLabels, maxValue, yTicks, plotH }
}

export default function MetricsHistogram({
  data,
  loading = false,
  emptyLabel = 'Нет данных',
  valueSuffix = '',
  variant = 'line',
}: MetricsHistogramProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(640)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const update = () => setChartWidth(Math.max(root.clientWidth, 280))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  if (loading) {
    return <div className="metrics-line-chart metrics-line-chart-loading">Загрузка…</div>
  }

  const geometry = buildGeometry(data, chartWidth)
  if (!geometry) {
    return <div className="metrics-line-chart metrics-line-chart-empty">{emptyLabel}</div>
  }

  const { seriesGeom, xLabels, maxValue, yTicks, plotH } = geometry
  const isArea = variant === 'area'

  // Показываем подписи значений только для синей серии (shipped), чтобы не загромождать
  const primarySeries = seriesGeom.find((s) => s.key === 'shipped')

  return (
    <div
      ref={rootRef}
      className={`metrics-line-chart metrics-line-chart-multi ${isArea ? 'metrics-line-chart-area-mode' : ''}`}
      role="img"
      aria-label="График отгрузки по релизам"
    >
      {/* Легенда */}
      <div className="metrics-line-chart-legend">
        {SERIES_DEFS.filter((s) => {
          const geom = seriesGeom.find((g) => g.key === s.key)
          return geom && geom.nodes.some((n) => n.value > 0)
        }).map((s) => (
          <span key={s.key} className={`metrics-line-chart-legend-item ${s.colorClass}`}>
            <span className="metrics-line-chart-legend-dot" />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        className="metrics-line-chart-svg"
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {/* Горизонтальные сетки */}
        {yTicks.map((tick) => {
          const y = PAD.top + plotH - (tick / maxValue) * plotH
          return (
            <g key={tick} className="metrics-line-chart-grid">
              <line x1={PAD.left} y1={y} x2={chartWidth - PAD.right} y2={y} />
              <text x={PAD.left - 6} y={y + 4} textAnchor="end">
                {tick}
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {xLabels.map(({ x, label, show }) =>
          show ? (
            <text key={label} className="metrics-line-chart-label" x={x} y={CHART_HEIGHT - 8} textAnchor="middle">
              {label}
            </text>
          ) : null,
        )}

        {/* Area fills (только в режиме area, только для основной серии) */}
        {isArea && primarySeries ? (
          <path className="metrics-line-chart-area" d={primarySeries.areaPath} />
        ) : null}

        {/* Линии: сначала зелёная (total), потом красная (errors), потом синяя (shipped) сверху */}
        {seriesGeom.map(({ key, colorClass, linePath }) => (
          <path
            key={key}
            className={`metrics-line-chart-line metrics-line-chart-line-${colorClass} ${isArea && key === 'shipped' ? 'metrics-line-chart-line-soft' : ''}`}
            d={linePath}
          />
        ))}

        {/* Точки и подписи значений */}
        {seriesGeom.map(({ key, colorClass, nodes }) =>
          nodes.map((node) => (
            <g key={`${key}-${node.label}`} className={`metrics-line-chart-node metrics-line-chart-node-${colorClass}`}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.value === 0 ? 3 : 4}
                className={node.value === 0 ? 'is-empty' : ''}
              />
              {/* Подписи только у синей серии чтобы не перекрывать */}
              {key === 'shipped' && chartWidth >= 320 ? (
                <text className="metrics-line-chart-value" x={node.x} y={node.y - 8} textAnchor="middle">
                  {node.value}
                </text>
              ) : null}
              <title>
                {SERIES_DEFS.find((s) => s.key === key)?.label ?? key}: {node.value}
                {valueSuffix} · {formatReleaseAxisLabel(node.label)}
              </title>
            </g>
          )),
        )}
      </svg>
    </div>
  )
}

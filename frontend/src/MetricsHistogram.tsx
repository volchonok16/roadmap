import { useEffect, useRef, useState } from 'react'
import type { MetricBarPoint } from './metricsCharts'
import { formatReleaseAxisLabel } from './MetricsBarChart'

type MetricsHistogramProps = {
  series: MetricBarPoint[]
  loading?: boolean
  emptyLabel?: string
  valueSuffix?: string
  variant?: 'line' | 'area'
}

const CHART_HEIGHT = 200
const PAD = { top: 22, right: 12, bottom: 32, left: 36 }

function labelStride(pointCount: number, chartWidth: number) {
  if (pointCount <= 8) return 1
  if (chartWidth < 360) return Math.ceil(pointCount / 4)
  if (chartWidth < 520) return Math.ceil(pointCount / 6)
  if (chartWidth < 720) return Math.ceil(pointCount / 8)
  return 1
}

function buildLineGeometry(series: MetricBarPoint[], chartWidth: number) {
  const points = [...series].sort((a, b) => a.sortKey - b.sortKey)
  if (!points.length) return null

  const maxValue = Math.max(...points.map((item) => item.value), 1)
  const plotW = chartWidth - PAD.left - PAD.right
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom
  const step = points.length > 1 ? plotW / (points.length - 1) : 0
  const stride = labelStride(points.length, chartWidth)

  const nodes = points.map((item, index) => {
    const x = PAD.left + (points.length > 1 ? step * index : plotW / 2)
    const y = PAD.top + plotH - (item.value / maxValue) * plotH
    const showLabel = index === 0 || index === points.length - 1 || index % stride === 0
    return { item, x, y, label: formatReleaseAxisLabel(item.label), showLabel }
  })

  const linePath = nodes.map((node, index) => `${index === 0 ? 'M' : 'L'} ${node.x} ${node.y}`).join(' ')
  const areaPath = `${linePath} L ${nodes[nodes.length - 1].x} ${PAD.top + plotH} L ${nodes[0].x} ${PAD.top + plotH} Z`

  const yTicks = [0, Math.ceil(maxValue / 2), maxValue].filter((value, index, arr) => arr.indexOf(value) === index)

  return { nodes, linePath, areaPath, maxValue, yTicks, plotH }
}

export default function MetricsHistogram({
  series,
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

  const geometry = buildLineGeometry(series, chartWidth)
  if (!geometry) {
    return <div className="metrics-line-chart metrics-line-chart-empty">{emptyLabel}</div>
  }

  const { nodes, linePath, areaPath, maxValue, yTicks, plotH } = geometry
  const isArea = variant === 'area'

  return (
    <div
      ref={rootRef}
      className={`metrics-line-chart ${isArea ? 'metrics-line-chart-area-mode' : ''}`}
      role="img"
      aria-label="График отгрузки по релизам"
    >
      <svg
        className="metrics-line-chart-svg"
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
      >
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
        <path className="metrics-line-chart-area" d={areaPath} />
        <path
          className={`metrics-line-chart-line ${isArea ? 'metrics-line-chart-line-soft' : ''}`}
          d={linePath}
        />
        {nodes.map((node) => (
          <g key={node.item.label} className="metrics-line-chart-node">
            <circle
              cx={node.x}
              cy={node.y}
              r={node.item.value === 0 ? 3.5 : 4.5}
              className={node.item.value === 0 ? 'is-empty' : ''}
            />
            {chartWidth >= 320 ? (
              <text className="metrics-line-chart-value" x={node.x} y={node.y - 8} textAnchor="middle">
                {node.item.value}
              </text>
            ) : null}
            {node.showLabel ? (
              <text className="metrics-line-chart-label" x={node.x} y={CHART_HEIGHT - 8} textAnchor="middle">
                {node.label}
              </text>
            ) : null}
            <title>
              {node.label}: {node.item.value}
              {valueSuffix}
            </title>
          </g>
        ))}
      </svg>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import GridLayout, { noCompactor, useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  defaultMetricsGridLayout,
  METRICS_GRID_COLS,
  METRICS_GRID_MARGIN,
  METRICS_GRID_ROW_HEIGHT,
  type MetricsGridLayoutItem,
} from './metricsDashboardLayout'
import type { MetricWidgetId } from './metricsWidgets'

const RESIZE_HANDLES = ['s', 'e', 'se'] as const
const EDIT_HINT_HEIGHT = 46
const EDIT_EXTRA_ROWS = 8

type MetricsDashboardGridProps = {
  editMode: boolean
  layout: MetricsGridLayoutItem[]
  onLayoutChange: (layout: MetricsGridLayoutItem[]) => void
  onLayoutCommit: (layout: MetricsGridLayoutItem[]) => void
  children: (widgetId: MetricWidgetId) => ReactNode
}

function toGridLayout(items: MetricsGridLayoutItem[]): Layout {
  return items.map((item) => ({
    i: item.i,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    minH: item.minH,
    maxW: item.maxW,
    maxH: item.maxH,
  }))
}

function fromGridLayout(layout: Layout): MetricsGridLayoutItem[] {
  return layout.map((item) => ({
    i: item.i as MetricWidgetId,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    minW: item.minW,
    minH: item.minH,
    maxW: item.maxW,
    maxH: item.maxH,
  }))
}

function pixelHeightForRows(rows: number) {
  const gapY = METRICS_GRID_MARGIN[1]
  return rows * METRICS_GRID_ROW_HEIGHT + Math.max(0, rows - 1) * gapY
}

function rowsForPixelHeight(pixelHeight: number) {
  const gapY = METRICS_GRID_MARGIN[1]
  const stride = METRICS_GRID_ROW_HEIGHT + gapY
  return Math.max(4, Math.floor((pixelHeight + gapY) / stride))
}

export default function MetricsDashboardGrid({
  editMode,
  layout,
  onLayoutChange,
  onLayoutCommit,
  children,
}: MetricsDashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 })
  const [containerHeight, setContainerHeight] = useState(0)

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const measure = () => setContainerHeight(root.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [containerRef, mounted, editMode])

  const canvasMinHeight = useMemo(() => {
    const usedRows = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
    const layoutRows = usedRows + (editMode ? EDIT_EXTRA_ROWS : 1)
    const hintOffset = editMode ? EDIT_HINT_HEIGHT : 0
    const available = Math.max(240, containerHeight - hintOffset - 12)
    const fillRows = rowsForPixelHeight(available)
    const rows = Math.max(layoutRows, fillRows)
    return pixelHeightForRows(rows)
  }, [layout, editMode, containerHeight])

  const commitLayout = useCallback(
    (next: Layout) => {
      onLayoutCommit(fromGridLayout(next))
    },
    [onLayoutCommit],
  )

  const resetLayout = useCallback(() => {
    onLayoutCommit(defaultMetricsGridLayout)
  }, [onLayoutCommit])

  if (!mounted) {
    return <div ref={containerRef} className="metrics-dashboard-grid metrics-dashboard-grid-measuring" />
  }

  return (
    <div
      ref={containerRef}
      className={`metrics-dashboard-grid ${editMode ? 'is-editing' : 'is-view'}`}
    >
      {editMode ? (
        <p className="metrics-dashboard-grid-hint">
          Сетка на всю панель: тяните за шапку, размер — за правый/нижний край или угол. Раскладка сохраняется в вашей учётной
          записи TFS.{' '}
          <button type="button" className="metrics-dashboard-grid-reset" onClick={resetLayout}>
            Сбросить
          </button>
        </p>
      ) : null}

      <div className="metrics-dashboard-grid-canvas">
        <GridLayout
          width={width}
          layout={toGridLayout(layout)}
          autoSize
          compactor={noCompactor}
          gridConfig={{
            cols: METRICS_GRID_COLS,
            rowHeight: METRICS_GRID_ROW_HEIGHT,
            margin: METRICS_GRID_MARGIN,
            containerPadding: [0, 0],
            maxRows: Infinity,
          }}
          dragConfig={{
            enabled: editMode,
            handle: '.metrics-widget-drag-handle',
            cancel: '.metrics-widget-no-drag, button, select, input, textarea, a, .metrics-chart-type-picker',
            bounded: false,
          }}
          resizeConfig={{
            enabled: editMode,
            handles: [...RESIZE_HANDLES],
          }}
          onLayoutChange={(next) => onLayoutChange(fromGridLayout(next))}
          onDragStop={commitLayout}
          onResizeStop={commitLayout}
          className="metrics-dashboard-grid-layout"
          style={{ minHeight: canvasMinHeight }}
        >
          {layout.map((item) => (
            <div key={item.i} className="metrics-grid-item">
              {children(item.i)}
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  )
}

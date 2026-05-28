import { useCallback, useEffect, useMemo, useState } from 'react'
import { readInitialSelectedBoardIds, readPinnedBoardId } from './boardPreferences'
import MetricsBoardPicker from './MetricsBoardPicker'
import { apiFetch, clearSessionId, getJson } from './api'
import MetricsDashboardGrid from './MetricsDashboardGrid'
import MetricsChartTypePicker from './MetricsChartTypePicker'
import MetricsReleaseChart from './MetricsReleaseChart'
import MetricsProgressChart from './MetricsProgressChart'
import MetricsAnalysisStayChart from './MetricsAnalysisStayChart'
import MetricsReworkChart from './MetricsReworkChart'
import { readMetricsChartType, writeMetricsChartType, type MetricsChartType } from './metricsChartType'
import { readMetricsGridLayout, writeMetricsGridLayout, type MetricsGridLayoutItem } from './metricsDashboardLayout'
import {
  fetchMetricsUiPreferences,
  readLocalMetricsUiPreferences,
  saveMetricsUiPreferences,
} from './metricsUserSettings'
import { readMetricsStreamBoardId, writeMetricsStreamBoardId } from './metricsBoard'
import {
  analysisBoardSummaryForBoard,
  analysisStaysForBoard,
  buildHistogramFromShipments,
  buildReleaseProgressPoints,
  requirementReworkSummaryForBoard,
  requirementReworksForBoard,
  shipmentsForBoard,
  type MetricsAnalysisStay,
  type MetricsDashboard,
  type MetricsRequirementRework,
} from './metricsDashboard'
import { defaultMetricWidgets, type MetricWidgetId } from './metricsWidgets'
import './App.css'

type MetricsScreenProps = {
  onLogout: () => void
}

function metricsLoadRange() {
  const year = new Date().getFullYear()
  return { from: `${year - 2}-01-01`, to: `${year + 2}-12-31` }
}

function readInitialMetricsBoardId(boards: MetricsDashboard['boards']) {
  const saved = readMetricsStreamBoardId()
  if (saved && boards.some((board) => board.id === saved)) return saved
  const pinned = readPinnedBoardId()
  if (pinned && boards.some((board) => board.id === pinned)) return pinned
  const fromRoadmap = readInitialSelectedBoardIds().find((id) => boards.some((board) => board.id === id))
  if (fromRoadmap) return fromRoadmap
  return ''
}

function formatMetricValue(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU')
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadAnalysisCsv(rows: MetricsAnalysisStay[]) {
  const header = ['board', 'item_id', 'title', 'state', 'column', 'days_in_analysis', 'changed_at', 'area_path']
  const lines = [
    header.map(csvCell).join(';'),
    ...rows.map((row) =>
      [
        row.boardName,
        row.itemId,
        row.title,
        row.state,
        row.column,
        row.daysInAnalysis,
        row.changedAt,
        row.areaPath,
      ]
        .map(csvCell)
        .join(';'),
    ),
  ]
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'analysis-stay-by-board.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function downloadReworkCsv(rows: MetricsRequirementRework[]) {
  const header = ['board', 'requirement_id', 'parent_zni_id', 'title', 'state', 'column', 'changed_at', 'area_path']
  const lines = [
    header.map(csvCell).join(';'),
    ...rows.map((row) =>
      [
        row.boardName,
        row.itemId,
        row.parentId,
        row.title,
        row.state,
        row.column,
        row.changedAt,
        row.areaPath,
      ]
        .map(csvCell)
        .join(';'),
    ),
  ]
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'requirements-returned-to-develop.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const widgetMeta = Object.fromEntries(defaultMetricWidgets.map((widget) => [widget.id, widget])) as Record<
  MetricWidgetId,
  (typeof defaultMetricWidgets)[number]
>

export default function MetricsScreen({ onLogout }: MetricsScreenProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<MetricsDashboard | null>(null)
  const [streamBoardId, setStreamBoardId] = useState('')
  const [layoutEditMode, setLayoutEditMode] = useState(false)
  const [gridLayout, setGridLayout] = useState<MetricsGridLayoutItem[]>(() => readMetricsGridLayout())
  const [uiPrefsReady, setUiPrefsReady] = useState(false)
  const [releaseChartType, setReleaseChartType] = useState<MetricsChartType>(() =>
    readMetricsChartType('release-shipment'),
  )
  const range = useMemo(() => metricsLoadRange(), [])

  const boards = dashboard?.boards ?? []

  const streamShipments = useMemo(
    () => shipmentsForBoard(dashboard?.shipments ?? [], streamBoardId || null, boards),
    [dashboard?.shipments, streamBoardId, boards],
  )

  const releaseHistogram = useMemo(
    () =>
      buildHistogramFromShipments(streamShipments, dashboard?.releases ?? [], {
        maxBars: 24,
        includeEmptyBars: false,
      }),
    [streamShipments, dashboard?.releases],
  )

  const shippedTotalFromHistogram = useMemo(
    () =>
      releaseHistogram.points
        .filter((p) => p.label !== 'Без релиза' && p.label !== 'Closed без даты')
        .reduce((acc, p) => acc + p.shipped, 0) + releaseHistogram.withoutRelease.shipped,
    [releaseHistogram],
  )

  const releaseProgressPoints = useMemo(
    () => buildReleaseProgressPoints(streamShipments, dashboard?.releases ?? [], { maxBars: 20 }),
    [streamShipments, dashboard?.releases],
  )

  const analysisStayRows = useMemo(
    () => analysisStaysForBoard(dashboard?.analysisStays ?? [], streamBoardId || null, boards),
    [dashboard?.analysisStays, streamBoardId, boards],
  )

  const analysisBoardRows = useMemo(
    () => analysisBoardSummaryForBoard(dashboard?.analysisByBoard ?? [], streamBoardId || null, boards),
    [dashboard?.analysisByBoard, streamBoardId, boards],
  )

  const reworkRows = useMemo(
    () => requirementReworksForBoard(dashboard?.requirementReworks ?? [], streamBoardId || null, boards),
    [dashboard?.requirementReworks, streamBoardId, boards],
  )

  const reworkBoardRows = useMemo(
    () => requirementReworkSummaryForBoard(dashboard?.requirementReworksByBoard ?? [], streamBoardId || null, boards),
    [dashboard?.requirementReworksByBoard, streamBoardId, boards],
  )

  const loadMetrics = useCallback(async (rebuildMart = false) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to })
      if (rebuildMart) params.set('refresh', 'true')
      const data = await getJson<MetricsDashboard>(`/api/metrics/dashboard?${params}`)
      setDashboard(data)
      setStreamBoardId((prev) => {
        if (prev && data.boards.some((board) => board.id === prev)) return prev
        return readInitialMetricsBoardId(data.boards)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить метрики')
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  useEffect(() => {
    writeMetricsStreamBoardId(streamBoardId)
  }, [streamBoardId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const local = readLocalMetricsUiPreferences()
      try {
        const remote = await fetchMetricsUiPreferences()
        if (cancelled) return
        if (remote) {
          setGridLayout(remote.layout)
          writeMetricsGridLayout(remote.layout)
          const remoteChart = remote.chartTypes['release-shipment']
          if (remoteChart) {
            setReleaseChartType(remoteChart)
            writeMetricsChartType('release-shipment', remoteChart)
          }
        } else {
          setGridLayout(local.layout)
          const localChart = local.chartTypes['release-shipment']
          if (localChart) setReleaseChartType(localChart)
          void saveMetricsUiPreferences(local).catch(() => {
            /* session or network */
          })
        }
      } catch {
        if (!cancelled) {
          setGridLayout(local.layout)
          const localChart = local.chartTypes['release-shipment']
          if (localChart) setReleaseChartType(localChart)
        }
      } finally {
        if (!cancelled) setUiPrefsReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const persistUiPreferences = useCallback(
    (layout: MetricsGridLayoutItem[], chartType: MetricsChartType) => {
      writeMetricsGridLayout(layout)
      writeMetricsChartType('release-shipment', chartType)
      if (!uiPrefsReady) return
      void saveMetricsUiPreferences({
        layout,
        chartTypes: { 'release-shipment': chartType },
      }).catch(() => {
        /* session or network */
      })
    },
    [uiPrefsReady],
  )

  const handleGridLayoutCommit = useCallback(
    (layout: MetricsGridLayoutItem[]) => {
      setGridLayout(layout)
      persistUiPreferences(layout, releaseChartType)
    },
    [persistUiPreferences, releaseChartType],
  )

  const handleChartTypeChange = useCallback(
    (chartType: MetricsChartType) => {
      setReleaseChartType(chartType)
      persistUiPreferences(gridLayout, chartType)
    },
    [gridLayout, persistUiPreferences],
  )

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    } finally {
      clearSessionId()
      onLogout()
    }
  }

  const streamBoardName =
    streamBoardId ? boards.find((board) => board.id === streamBoardId)?.name ?? 'Доска' : 'Все доски'

  const shippedTotal = shippedTotalFromHistogram
  const activeRequirementsCount = dashboard?.totals.activeRequirementsCount ?? 0
  const activeErrorsCount = dashboard?.totals.activeErrorsCount ?? 0
  const activeTotalCount = dashboard?.totals.activeTotalCount ?? activeRequirementsCount + activeErrorsCount

  const widgetValues: Record<MetricWidgetId, number | null> = {
    'streams-count': dashboard?.totals.streams ?? null,
    'release-shipment': shippedTotal,
    'release-progress': releaseProgressPoints.length,
    'analysis-stay': analysisStayRows.length,
    'test-rework': reworkRows.length,
  }

  const streamBoardPicker = (
    <MetricsBoardPicker
      boards={boards}
      value={streamBoardId}
      disabled={loading}
      onChange={setStreamBoardId}
    />
  )

  const renderWidgetBody = (widgetId: MetricWidgetId, kind: (typeof defaultMetricWidgets)[number]['kind']) => {
    if (kind === 'kpi') {
      return (
        <div className="metrics-widget-body metrics-widget-body-kpi">
          <span className="metrics-widget-value">{loading ? '…' : formatMetricValue(widgetValues[widgetId])}</span>
        </div>
      )
    }
    if (kind === 'progress-chart') {
      return (
        <div className="metrics-widget-body metrics-widget-body-chart">
          <p className="metrics-widget-chart-summary metrics-widget-no-drag">
            {loading
              ? '…'
              : `${streamBoardName}: ${releaseProgressPoints.length} релизов в работе`}
          </p>
          <div className="metrics-totals-row metrics-widget-no-drag">
            <span className="metrics-total-chip metrics-total-chip-green" title="Активные задачи (без Closed)">
              Активных задач: {loading ? '…' : activeTotalCount.toLocaleString('ru-RU')}
            </span>
            <span className="metrics-total-chip metrics-total-chip-blue" title="Активные требования (без Closed)">
              Требований: {loading ? '…' : activeRequirementsCount.toLocaleString('ru-RU')}
            </span>
            <span className="metrics-total-chip metrics-total-chip-red" title="Активные ошибки (без Closed)">
              Ошибок: {loading ? '…' : activeErrorsCount.toLocaleString('ru-RU')}
            </span>
          </div>
          <MetricsProgressChart
            points={releaseProgressPoints}
            loading={loading}
            emptyLabel={
              streamBoardId
                ? 'Нет данных о прогрессе по этой доске'
                : 'Нет данных в витрине'
            }
          />
        </div>
      )
    }
    if (kind === 'analysis-chart') {
      const avg =
        analysisStayRows.length > 0
          ? Math.round((analysisStayRows.reduce((acc, row) => acc + row.daysInAnalysis, 0) / analysisStayRows.length) * 10) / 10
          : 0
      return (
        <div className="metrics-widget-body metrics-widget-body-chart">
          <p className="metrics-widget-chart-summary metrics-widget-no-drag">
            {loading
              ? '…'
              : `${streamBoardName}: ${analysisStayRows.length.toLocaleString('ru-RU')} ЗНИ в анализе · среднее ${avg.toLocaleString('ru-RU')} дн.`}
          </p>
          <div className="metrics-widget-actions metrics-widget-no-drag">
            <button
              type="button"
              className="metrics-widget-export"
              disabled={loading || analysisStayRows.length === 0}
              onClick={() => downloadAnalysisCsv(analysisStayRows)}
            >
              Выгрузить CSV
            </button>
          </div>
          <MetricsAnalysisStayChart
            rows={analysisBoardRows}
            loading={loading}
            emptyLabel={
              streamBoardId
                ? 'На этой доске нет ЗНИ в колонках анализа'
                : 'Нет ЗНИ в колонках анализа'
            }
          />
        </div>
      )
    }
    if (kind === 'rework-chart') {
      return (
        <div className="metrics-widget-body metrics-widget-body-chart">
          <p className="metrics-widget-chart-summary metrics-widget-no-drag">
            {loading
              ? '…'
              : `${streamBoardName}: ${reworkRows.length.toLocaleString('ru-RU')} требований сейчас в Develop`}
          </p>
          <div className="metrics-widget-actions metrics-widget-no-drag">
            <button
              type="button"
              className="metrics-widget-export"
              disabled={loading || reworkRows.length === 0}
              onClick={() => downloadReworkCsv(reworkRows)}
            >
              Выгрузить CSV
            </button>
          </div>
          <MetricsReworkChart
            rows={reworkBoardRows}
            loading={loading}
            emptyLabel={
              streamBoardId
                ? 'На этой доске нет требований в Develop'
                : 'Нет требований в Develop'
            }
          />
        </div>
      )
    }
    return (
      <div className="metrics-widget-body metrics-widget-body-chart">
        <p className="metrics-widget-chart-summary metrics-widget-no-drag">
          {loading
            ? '…'
            : `${streamBoardName}: ${shippedTotal.toLocaleString('ru-RU')} отгружено по ${releaseHistogram.points.length} релизам`}
          {dashboard?.cacheBuiltAt
            ? ` · витрина ${new Date(dashboard.cacheBuiltAt).toLocaleString('ru-RU')}`
            : ''}
        </p>
        <MetricsReleaseChart
          chartType={releaseChartType}
          data={releaseHistogram}
          loading={loading}
          emptyLabel={
            streamBoardId
              ? 'Нет отгрузки по этой доске — нажмите «Пересчитать витрину» после выгрузки из TFS'
              : 'Нет данных в витрине'
          }
          valueSuffix=" треб."
        />
      </div>
    )
  }

  const renderWidget = (widgetId: MetricWidgetId) => {
    const widget = widgetMeta[widgetId]
    return (
      <article className={`metrics-widget metrics-widget-${widget.kind}`} data-metric-id={widget.id}>
        <header
          className={`metrics-widget-head ${layoutEditMode ? 'metrics-widget-drag-handle' : ''} ${widget.kind === 'release-chart' ? 'metrics-widget-head-chart' : ''}`}
        >
          <div className="metrics-widget-head-text">
            <h2 className="metrics-widget-title">{widget.title}</h2>
            <p className="metrics-widget-hint">{widget.hint}</p>
          </div>
          {widget.kind === 'release-chart' ? (
            <MetricsChartTypePicker
              value={releaseChartType}
              disabled={loading}
              onChange={handleChartTypeChange}
            />
          ) : null}
        </header>
        {renderWidgetBody(widget.id, widget.kind)}
      </article>
    )
  }

  return (
    <div className="app-shell metrics-shell">
      <header className="app-header metrics-header">
        <div className="app-header-row metrics-header-main">
          <h1 className="app-title">TFS Roadmap</h1>
          <span className="metrics-header-badge">Метрики</span>
          <div className="header-actions metrics-header-actions">
            <button
              type="button"
              className={`btn-layout-edit ${layoutEditMode ? 'is-active' : ''}`}
              onClick={() => setLayoutEditMode((value) => !value)}
              title="Перетаскивание и размер виджетов как в DataLens"
            >
              {layoutEditMode ? 'Готово' : 'Настроить'}
            </button>
            <button className="btn-refresh" type="button" onClick={() => void loadMetrics(false)} disabled={loading}>
              {loading ? '…' : 'Обновить'}
            </button>
            <button
              className="btn-sync"
              type="button"
              title="Пересобрать витрину из БД (после «Выгрузить» на Roadmap)"
              onClick={() => void loadMetrics(true)}
              disabled={loading}
            >
              {loading ? '…' : 'Пересчитать витрину'}
            </button>
            <button type="button" className="btn-logout" onClick={() => void logout()}>
              Выйти из TFS
            </button>
          </div>
        </div>
        <div className="metrics-header-toolbar">
          {streamBoardPicker}
          <p className="metrics-header-note">
            {dashboard?.totals.streams ?? '—'} досок · {streamBoardName} · период {range.from} — {range.to}
            {dashboard?.generatedAt ? ` · ответ ${new Date(dashboard.generatedAt).toLocaleTimeString('ru-RU')}` : ''}
            {dashboard?.totals ? ` · ${dashboard.totals.zniCount} ЗНИ` : ''}
          </p>
        </div>
      </header>

      <section className="metrics-panel">
        {error ? <div className="error">{error}</div> : null}
        <MetricsDashboardGrid
          editMode={layoutEditMode}
          layout={gridLayout}
          onLayoutChange={setGridLayout}
          onLayoutCommit={handleGridLayoutCommit}
        >
          {renderWidget}
        </MetricsDashboardGrid>
        <p className="metrics-dashboard-foot">
          Данные из витрины metrics_shipments (обновляется после «Выгрузить» / «Обновить» в TFS).
        </p>
      </section>
    </div>
  )
}

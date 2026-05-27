import { useCallback, useEffect, useMemo, useState } from 'react'
import { readInitialSelectedBoardIds } from './boardPreferences'
import { apiFetch, clearSessionId, getJson } from './api'
import MetricsBarChart from './MetricsBarChart'
import MetricsHistogram from './MetricsHistogram'
import { readMetricsStreamBoardId, writeMetricsStreamBoardId } from './metricsBoard'
import {
  buildHistogramFromShipments,
  formatReleaseFromDashboard,
  shipmentsForBoard,
  type MetricsDashboard,
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
  const fromRoadmap = readInitialSelectedBoardIds().find((id) => boards.some((board) => board.id === id))
  if (fromRoadmap) return fromRoadmap
  return ''
}

function formatMetricValue(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU')
}

export default function MetricsScreen({ onLogout }: MetricsScreenProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<MetricsDashboard | null>(null)
  const [streamBoardId, setStreamBoardId] = useState('')
  const range = useMemo(() => metricsLoadRange(), [])

  const streamShipments = useMemo(
    () => shipmentsForBoard(dashboard?.shipments ?? [], streamBoardId || null),
    [dashboard?.shipments, streamBoardId],
  )

  const releaseHistogram = useMemo(
    () =>
      buildHistogramFromShipments(streamShipments, dashboard?.releases ?? [], {
        maxBars: 16,
        includeEmptyBars: true,
      }),
    [streamShipments, dashboard?.releases],
  )

  const releaseChartCompact = useMemo(
    () =>
      buildHistogramFromShipments(streamShipments, dashboard?.releases ?? [], {
        maxBars: 8,
        includeEmptyBars: false,
      }),
    [streamShipments, dashboard?.releases],
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
    streamBoardId
      ? dashboard?.boards.find((board) => board.id === streamBoardId)?.name ?? 'Доска'
      : 'Все доски'

  const shippedTotal = releaseHistogram
    .filter((row) => row.label !== 'Closed без даты')
    .reduce((acc, row) => acc + row.value, 0)

  const widgetValues: Record<MetricWidgetId, number | null> = {
    'streams-count': dashboard?.totals.streams ?? null,
    'closed-requirements': streamBoardId
      ? shippedTotal
      : dashboard?.totals.closedRequirements ?? null,
    'release-shipment': shippedTotal,
  }

  const streamBoardSelect = (
    <label className="metrics-stream-board-picker">
      <span className="metrics-stream-board-picker-label">Стрим (доска)</span>
      <select
        className="metrics-stream-board-select filter-bar-input"
        value={streamBoardId}
        disabled={loading || !dashboard?.boards.length}
        aria-label="Доска стрима для гистограммы"
        onChange={(event) => setStreamBoardId(event.target.value)}
      >
        <option value="">Все доски</option>
        {(dashboard?.boards ?? []).map((board) => (
          <option key={board.id} value={board.id}>
            {board.name}
          </option>
        ))}
      </select>
    </label>
  )

  const renderWidgetBody = (widgetId: MetricWidgetId, kind: (typeof defaultMetricWidgets)[number]['kind']) => {
    if (kind === 'kpi') {
      return (
        <div className="metrics-widget-body metrics-widget-body-kpi">
          <span className="metrics-widget-value">{loading ? '…' : formatMetricValue(widgetValues[widgetId])}</span>
        </div>
      )
    }
    if (kind === 'kpi-release-chart') {
      return (
        <div className="metrics-widget-body metrics-widget-body-split">
          <span className="metrics-widget-value metrics-widget-value-compact">
            {loading ? '…' : formatMetricValue(widgetValues[widgetId])}
          </span>
          <MetricsBarChart
            series={releaseChartCompact}
            loading={loading}
            emptyLabel="Нет отгрузки по выбранной доске"
            formatLabel={formatReleaseFromDashboard}
            valueSuffix=" треб."
            variant="release"
          />
        </div>
      )
    }
    return (
      <div className="metrics-widget-body metrics-widget-body-chart">
        <p className="metrics-widget-chart-summary">
          {loading
            ? '…'
            : `${streamBoardName}: ${shippedTotal.toLocaleString('ru-RU')} отгружено (Closed + релиз TFS) по ${releaseHistogram.filter((r) => r.label !== 'Без релиза' && r.label !== 'Closed без даты').length} релизам`}
          {dashboard?.cacheBuiltAt
            ? ` · витрина ${new Date(dashboard.cacheBuiltAt).toLocaleString('ru-RU')}`
            : ''}
          {dashboard?.totals.closedWithoutRelease
            ? ` · без релиза: ${dashboard.totals.closedWithoutRelease}`
            : ''}
        </p>
        <MetricsHistogram
          series={releaseHistogram}
          loading={loading}
          emptyLabel="Нет данных в витрине для выбранной доски"
          valueSuffix=" треб."
        />
      </div>
    )
  }

  return (
    <div className="app-shell metrics-shell">
      <header className="app-header metrics-header">
        <div className="app-header-row">
          <h1 className="app-title">TFS Roadmap</h1>
          <span className="metrics-header-badge">Метрики</span>
          <div className="header-actions metrics-header-actions">
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
        <p className="metrics-header-note">
          Быстрая витрина метрик за период {range.from} — {range.to}
          {dashboard?.generatedAt ? ` · ответ ${new Date(dashboard.generatedAt).toLocaleTimeString('ru-RU')}` : ''}
          {dashboard?.totals
            ? ` · ${dashboard.totals.zniCount} ЗНИ в периоде`
            : ''}
        </p>
      </header>

      <section className="metrics-panel">
        {error ? <div className="error">{error}</div> : null}
        <div className="metrics-dashboard" aria-busy={loading}>
          {defaultMetricWidgets.map((widget) => (
            <article
              key={widget.id}
              className={`metrics-widget metrics-widget-${widget.kind}`}
              style={{ gridColumn: widget.gridColumn, gridRow: widget.gridRow }}
              data-metric-id={widget.id}
            >
              <header
                className={`metrics-widget-head ${widget.id === 'release-shipment' ? 'metrics-widget-head-with-picker' : ''}`}
              >
                <div className="metrics-widget-head-text">
                  <h2 className="metrics-widget-title">{widget.title}</h2>
                  <p className="metrics-widget-hint">{widget.hint}</p>
                </div>
                {widget.id === 'release-shipment' ? streamBoardSelect : null}
              </header>
              {renderWidgetBody(widget.id, widget.kind)}
            </article>
          ))}
        </div>
        <p className="metrics-dashboard-foot">
          Данные из витрины metrics_shipments (обновляется после «Выгрузить» / «Обновить» в TFS).
        </p>
      </section>
    </div>
  )
}

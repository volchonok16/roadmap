import { useCallback, useEffect, useMemo, useState } from 'react'
import { readInitialSelectedBoardIds } from './boardPreferences'
import { apiFetch, clearSessionId, getJson } from './api'
import MetricsBarChart, { formatReleaseAxisLabel } from './MetricsBarChart'
import MetricsHistogram from './MetricsHistogram'
import { readMetricsStreamBoardId, writeMetricsStreamBoardId } from './metricsBoard'
import { filterItemsByBoard } from './metricsBoardFilter'
import { buildShippedTasksByRelease, type MetricBarPoint } from './metricsCharts'
import { countClosedRequirements, countStreams } from './metricsSummary'
import { defaultMetricWidgets, type MetricWidgetId } from './metricsWidgets'
import { normalizeRoadmapItems } from './linkedErrors'
import type { ChangeRequest } from './roadmapTypes'
import './App.css'

type Board = {
  id: string
  name: string
}

type RoadmapResponse = {
  boards: Board[]
  items: ChangeRequest[]
  generatedAt: string
}

type MetricsSummary = {
  streams: number
  closedRequirements: number
  zniCount: number
  requirementCount: number
}

type MetricsScreenProps = {
  onLogout: () => void
}

function metricsLoadRange() {
  const year = new Date().getFullYear()
  return {
    from: `${year - 2}-01-01`,
    to: `${year + 2}-12-31`,
    fromDate: new Date(year - 2, 0, 1),
  }
}

function readInitialMetricsBoardId(boards: Board[]) {
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
  const [boards, setBoards] = useState<Board[]>([])
  const [allItems, setAllItems] = useState<ChangeRequest[]>([])
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [streamBoardId, setStreamBoardId] = useState('')
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const range = useMemo(() => metricsLoadRange(), [])

  const streamItems = useMemo(
    () => filterItemsByBoard(allItems, streamBoardId || null),
    [allItems, streamBoardId],
  )

  const releaseHistogram = useMemo(
    () =>
      buildShippedTasksByRelease(streamItems, range.fromDate, {
        maxBars: 16,
        includeEmptyBars: true,
      }),
    [streamItems, range.fromDate],
  )

  const releaseChartCompact = useMemo(
    () =>
      buildShippedTasksByRelease(streamItems, range.fromDate, {
        maxBars: 8,
        includeEmptyBars: false,
      }),
    [streamItems, range.fromDate],
  )

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const boardRows = await getJson<Board[]>('/api/boards')
      const params = new URLSearchParams({ from: range.from, to: range.to })
      const roadmap = await getJson<RoadmapResponse>(`/api/roadmap?${params}`)
      const items = normalizeRoadmapItems(roadmap.items ?? [])
      const mergedBoards = new Map(boardRows.map((board) => [board.id, board]))
      for (const board of roadmap.boards ?? []) mergedBoards.set(board.id, board)
      const boardList = Array.from(mergedBoards.values()).sort((left, right) =>
        left.name.localeCompare(right.name, 'ru'),
      )

      setBoards(boardList)
      setAllItems(items)
      setStreamBoardId((prev) => {
        if (prev && boardList.some((board) => board.id === prev)) return prev
        return readInitialMetricsBoardId(boardList)
      })

      const requirementCount = items.reduce((acc, item) => acc + item.requirements.length, 0)
      setSummary({
        streams: countStreams(boardList.length),
        closedRequirements: countClosedRequirements(items),
        zniCount: items.length,
        requirementCount,
      })
      setGeneratedAt(roadmap.generatedAt ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить метрики')
      setSummary(null)
      setAllItems([])
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
    streamBoardId ? boards.find((board) => board.id === streamBoardId)?.name ?? 'Доска' : 'Все доски'

  const shippedTotal = releaseHistogram
    .filter((row) => row.label !== 'Closed без даты')
    .reduce((acc, row) => acc + row.value, 0)

  const widgetValues: Record<MetricWidgetId, number | null> = {
    'streams-count': summary?.streams ?? null,
    'closed-requirements': countClosedRequirements(streamItems),
    'release-shipment': shippedTotal,
  }

  const streamBoardSelect = (
    <label className="metrics-stream-board-picker">
      <span className="metrics-stream-board-picker-label">Стрим (доска)</span>
      <select
        className="metrics-stream-board-select filter-bar-input"
        value={streamBoardId}
        disabled={loading || !boards.length}
        aria-label="Доска стрима для гистограммы"
        onChange={(event) => setStreamBoardId(event.target.value)}
      >
        <option value="">Все доски</option>
        {boards.map((board) => (
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
            formatLabel={formatReleaseAxisLabel}
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
            : `${streamBoardName}: ${shippedTotal.toLocaleString('ru-RU')} отгружено по ${releaseHistogram.filter((r) => r.label !== 'Closed без даты').length} релизам`}
        </p>
        <MetricsHistogram
          series={releaseHistogram}
          loading={loading}
          emptyLabel="Нет закрытых требований с датой Closed для выбранной доски"
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
            <button className="btn-refresh" type="button" onClick={() => void loadMetrics()} disabled={loading}>
              {loading ? '…' : 'Обновить'}
            </button>
            <button type="button" className="btn-logout" onClick={() => void logout()}>
              Выйти из TFS
            </button>
          </div>
        </div>
        <p className="metrics-header-note">
          Сводка по данным TFS за период {range.from} — {range.to}
          {generatedAt ? ` · обновлено ${new Date(generatedAt).toLocaleString('ru-RU')}` : ''}
          {summary
            ? ` · ${summary.zniCount} ЗНИ, ${summary.requirementCount} требований`
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
          В следующих версиях виджеты можно будет перетаскивать и менять размер.
        </p>
      </section>
    </div>
  )
}

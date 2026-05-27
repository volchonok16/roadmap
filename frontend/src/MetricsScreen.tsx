import { useCallback, useEffect, useMemo, useState } from 'react'
import { readInitialSelectedBoardIds } from './boardPreferences'
import { apiFetch, clearSessionId, getJson } from './api'
import MetricsBarChart, { formatReleaseAxisLabel } from './MetricsBarChart'
import {
  buildClosedDeliveriesByRelease,
  buildClosedDeliveriesByTeam,
  type MetricBarPoint,
} from './metricsCharts'
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

type MetricsCharts = {
  byRelease: MetricBarPoint[]
  byTeam: MetricBarPoint[]
}

type MetricsScreenProps = {
  onLogout: () => void
}

function metricsLoadRange() {
  const year = new Date().getFullYear()
  return { from: `${year - 2}-01-01`, to: `${year + 2}-12-31` }
}

function formatMetricValue(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('ru-RU')
}

function shortTeamLabel(label: string) {
  const trimmed = label.replace(/^Digital Streams\s+/i, 'DS ')
  return trimmed.length > 14 ? `${trimmed.slice(0, 13)}…` : trimmed
}

export default function MetricsScreen({ onLogout }: MetricsScreenProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [charts, setCharts] = useState<MetricsCharts | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const range = useMemo(() => metricsLoadRange(), [])
  const highlightBoardIds = useMemo(() => readInitialSelectedBoardIds(), [])

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const boards = await getJson<Board[]>('/api/boards')
      const params = new URLSearchParams({ from: range.from, to: range.to })
      const roadmap = await getJson<RoadmapResponse>(`/api/roadmap?${params}`)
      const items = normalizeRoadmapItems(roadmap.items ?? [])
      const requirementCount = items.reduce((acc, item) => acc + item.requirements.length, 0)
      setSummary({
        streams: countStreams(boards.length),
        closedRequirements: countClosedRequirements(items),
        zniCount: items.length,
        requirementCount,
      })
      setCharts({
        byRelease: buildClosedDeliveriesByRelease(items),
        byTeam: buildClosedDeliveriesByTeam(items, highlightBoardIds),
      })
      setGeneratedAt(roadmap.generatedAt ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить метрики')
      setSummary(null)
      setCharts(null)
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, highlightBoardIds])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

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

  const widgetValues: Record<MetricWidgetId, number | null> = {
    'streams-count': summary?.streams ?? null,
    'closed-requirements': summary?.closedRequirements ?? null,
    'team-comparison': summary?.closedRequirements ?? null,
  }

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
            series={charts?.byRelease ?? []}
            loading={loading}
            emptyLabel="Нет закрытых требований с релизом"
            formatLabel={formatReleaseAxisLabel}
            valueSuffix=" треб."
            variant="release"
          />
        </div>
      )
    }
    const teamTotal = charts?.byTeam.reduce((acc, row) => acc + row.value, 0) ?? 0
    return (
      <div className="metrics-widget-body metrics-widget-body-chart">
        <p className="metrics-widget-chart-summary">
          {loading ? '…' : `${teamTotal.toLocaleString('ru-RU')} закрытых требований по ${charts?.byTeam.length ?? 0} командам`}
        </p>
        <MetricsBarChart
          series={charts?.byTeam ?? []}
          loading={loading}
          emptyLabel="Нет закрытых требований по командам"
          formatLabel={shortTeamLabel}
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
              <header className="metrics-widget-head">
                <h2 className="metrics-widget-title">{widget.title}</h2>
                <p className="metrics-widget-hint">{widget.hint}</p>
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

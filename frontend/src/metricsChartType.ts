import type { MetricWidgetId } from './metricsWidgets'

export type MetricsChartType = 'line' | 'bar' | 'area'

export const METRICS_CHART_TYPE_OPTIONS: { value: MetricsChartType; label: string }[] = [
  { value: 'line', label: 'Линия' },
  { value: 'bar', label: 'Столбцы' },
  { value: 'area', label: 'Область' },
]

const STORAGE_KEY = 'metrics-chart-types-v1'
const DEFAULT_CHART_TYPE: MetricsChartType = 'line'
const chartWidgetIds: MetricWidgetId[] = ['release-shipment']

function isChartType(value: unknown): value is MetricsChartType {
  return value === 'line' || value === 'bar' || value === 'area'
}

export function readMetricsChartTypes(): Partial<Record<MetricWidgetId, MetricsChartType>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Partial<Record<MetricWidgetId, MetricsChartType>> = {}
    for (const widgetId of chartWidgetIds) {
      const value = (parsed as Record<string, unknown>)[widgetId]
      if (isChartType(value)) result[widgetId] = value
    }
    return result
  } catch {
    return {}
  }
}

export function readMetricsChartType(widgetId: MetricWidgetId): MetricsChartType {
  return readMetricsChartTypes()[widgetId] ?? DEFAULT_CHART_TYPE
}

export function writeMetricsChartType(widgetId: MetricWidgetId, chartType: MetricsChartType) {
  try {
    const current = readMetricsChartTypes()
    current[widgetId] = chartType
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
}

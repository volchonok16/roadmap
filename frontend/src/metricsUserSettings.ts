import { apiFetch, putJson, readApiError } from './api'
import {
  normalizeMetricsGridLayout,
  readMetricsGridLayout,
  type MetricsGridLayoutItem,
} from './metricsDashboardLayout'
import {
  readMetricsChartTypes,
  type MetricsChartType,
} from './metricsChartType'
import type { MetricWidgetId } from './metricsWidgets'

export type MetricsUiPreferences = {
  layout: MetricsGridLayoutItem[]
  chartTypes: Partial<Record<MetricWidgetId, MetricsChartType>>
}

type MetricsUiPreferencesResponse = {
  layout: MetricsGridLayoutItem[]
  chartTypes: Partial<Record<string, MetricsChartType>>
}

function normalizeChartTypes(raw: Partial<Record<string, MetricsChartType>> | undefined): MetricsUiPreferences['chartTypes'] {
  const result: MetricsUiPreferences['chartTypes'] = {}
  const value = raw?.['release-shipment']
  if (value === 'line' || value === 'bar' || value === 'area') {
    result['release-shipment'] = value
  }
  return result
}

export function normalizeMetricsUiPreferences(data: MetricsUiPreferencesResponse): MetricsUiPreferences {
  return {
    layout: normalizeMetricsGridLayout(data.layout),
    chartTypes: normalizeChartTypes(data.chartTypes),
  }
}

export function readLocalMetricsUiPreferences(): MetricsUiPreferences {
  return {
    layout: readMetricsGridLayout(),
    chartTypes: readMetricsChartTypes(),
  }
}

export async function fetchMetricsUiPreferences(): Promise<MetricsUiPreferences | null> {
  const response = await apiFetch('/api/user/metrics-preferences')
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  const data = (await response.json()) as MetricsUiPreferencesResponse
  return normalizeMetricsUiPreferences(data)
}

export async function saveMetricsUiPreferences(prefs: MetricsUiPreferences): Promise<void> {
  await putJson('/api/user/metrics-preferences', {
    layout: prefs.layout,
    chartTypes: prefs.chartTypes,
  })
}


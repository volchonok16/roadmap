import type { MetricWidgetId } from './metricsWidgets'

export type MetricsGridLayoutItem = {
  i: MetricWidgetId
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

export const METRICS_GRID_COLS = 12
export const METRICS_GRID_ROW_HEIGHT = 36
export const METRICS_GRID_MARGIN: [number, number] = [16, 16]
/** Кэш в localStorage (миграция и офлайн-fallback; основное хранилище — API по учётной записи TFS). */
export const METRICS_LAYOUT_STORAGE_KEY = 'metrics-dashboard-layout-v6'

export const defaultMetricsGridLayout: MetricsGridLayoutItem[] = [
  { i: 'streams-count', x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2, maxW: 4, maxH: 8 },
  { i: 'release-shipment', x: 3, y: 0, w: 9, h: 9, minW: 4, minH: 4, maxW: 12, maxH: 24 },
  { i: 'release-progress', x: 0, y: 9, w: 12, h: 9, minW: 4, minH: 4, maxW: 12, maxH: 24 },
  { i: 'analysis-stay', x: 0, y: 18, w: 12, h: 8, minW: 4, minH: 4, maxW: 12, maxH: 24 },
  { i: 'test-rework', x: 0, y: 26, w: 12, h: 8, minW: 4, minH: 4, maxW: 12, maxH: 24 },
]

const widgetIds = new Set<MetricWidgetId>([
  'streams-count',
  'release-shipment',
  'release-progress',
  'analysis-stay',
  'test-rework',
])

function isValidItem(item: unknown): item is MetricsGridLayoutItem {
  if (!item || typeof item !== 'object') return false
  const row = item as MetricsGridLayoutItem
  return (
    widgetIds.has(row.i) &&
    Number.isFinite(row.x) &&
    Number.isFinite(row.y) &&
    Number.isFinite(row.w) &&
    Number.isFinite(row.h) &&
    row.w >= 1 &&
    row.h >= 1 &&
    row.x >= 0 &&
    row.y >= 0 &&
    row.x + row.w <= METRICS_GRID_COLS
  )
}

export function normalizeMetricsGridLayout(raw: unknown): MetricsGridLayoutItem[] {
  if (!Array.isArray(raw)) return defaultMetricsGridLayout
  const items = raw.filter(isValidItem)
  const ids = new Set(items.map((item) => item.i))
  // Если все обязательные виджеты присутствуют, принимаем раскладку (даже если новый виджет ещё не добавлен)
  if (![...widgetIds].every((id) => ids.has(id))) {
    // Добавляем отсутствующие виджеты из дефолта
    const missing = defaultMetricsGridLayout.filter((item) => !ids.has(item.i))
    if (missing.length > 0 && items.length > 0) return [...items, ...missing]
    return defaultMetricsGridLayout
  }
  return items
}

export function readMetricsGridLayout(): MetricsGridLayoutItem[] {
  try {
    const raw = localStorage.getItem(METRICS_LAYOUT_STORAGE_KEY)
    if (!raw) return defaultMetricsGridLayout
    return normalizeMetricsGridLayout(JSON.parse(raw) as unknown)
  } catch {
    return defaultMetricsGridLayout
  }
}

export function writeMetricsGridLayout(layout: MetricsGridLayoutItem[]) {
  try {
    localStorage.setItem(METRICS_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    /* ignore */
  }
}

export function clearMetricsGridLayout() {
  try {
    localStorage.removeItem(METRICS_LAYOUT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

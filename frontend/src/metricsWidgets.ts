/** Идентификаторы виджетов на странице метрик (раскладка — metricsDashboardLayout). */
export type MetricWidgetId =
  | 'streams-count'
  | 'release-shipment'
  | 'release-progress'
  | 'analysis-stay'
  | 'test-rework'

export type MetricWidgetKind = 'kpi' | 'release-chart' | 'progress-chart' | 'analysis-chart' | 'rework-chart'

export type MetricWidgetLayout = {
  id: MetricWidgetId
  kind: MetricWidgetKind
  title: string
  hint: string
}

export const defaultMetricWidgets: MetricWidgetLayout[] = [
  {
    id: 'streams-count',
    kind: 'kpi',
    title: 'Стримы (доски)',
    hint: 'Количество досок TFS, подключённых к roadmap',
  },
  {
    id: 'release-shipment',
    kind: 'release-chart',
    title: 'Отгрузка по релизам',
    hint: 'Closed по релизам · тип графика справа',
  },
  {
    id: 'release-progress',
    kind: 'progress-chart',
    title: 'Прогресс по релизам',
    hint: 'Сколько требований закрыто и ещё в работе по каждому релизу',
  },
  {
    id: 'analysis-stay',
    kind: 'analysis-chart',
    title: 'ЗНИ в анализе по доскам',
    hint: 'Сколько дней ЗНИ лежат в колонках анализа · выгрузка CSV',
  },
  {
    id: 'test-rework',
    kind: 'rework-chart',
    title: 'Возвраты требований в Develop',
    hint: 'Текущие требования в колонке доработки, сгруппированные по доскам · выгрузка CSV',
  },
]

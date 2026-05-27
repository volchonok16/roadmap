/** Идентификаторы виджетов на странице метрик (позже — drag/resize в сетке). */
export type MetricWidgetId = 'streams-count' | 'closed-requirements' | 'team-comparison'

export type MetricWidgetKind = 'kpi' | 'kpi-release-chart' | 'team-chart'

export type MetricWidgetLayout = {
  id: MetricWidgetId
  kind: MetricWidgetKind
  title: string
  hint: string
  gridColumn?: string
  gridRow?: string
}

/** Порядок и раскладка по умолчанию; позже можно хранить в localStorage. */
export const defaultMetricWidgets: MetricWidgetLayout[] = [
  {
    id: 'streams-count',
    kind: 'kpi',
    title: 'Стримы (доски)',
    hint: 'Количество досок TFS, подключённых к roadmap',
    gridColumn: 'span 1',
  },
  {
    id: 'closed-requirements',
    kind: 'kpi-release-chart',
    title: 'Требования в Closed',
    hint: 'Отгрузка: закрытые требования по релизам',
    gridColumn: 'span 1',
  },
  {
    id: 'team-comparison',
    kind: 'team-chart',
    title: 'Сравнение с командами',
    hint: 'Закрытые требования по доскам/стримам (выделены ваши команды с Roadmap)',
    gridColumn: '1 / -1',
  },
]

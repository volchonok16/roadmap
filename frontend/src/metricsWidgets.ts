/** Идентификаторы виджетов на странице метрик (позже — drag/resize в сетке). */
export type MetricWidgetId = 'streams-count' | 'closed-requirements' | 'board-comparison'

export type MetricWidgetKind = 'kpi' | 'kpi-release-chart' | 'board-chart'

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
    id: 'board-comparison',
    kind: 'board-chart',
    title: 'Сравнение досок',
    hint: 'Команда = доска TFS. Закрытые требования по каждой доске; зелёным — доски, выбранные на Roadmap',
    gridColumn: '1 / -1',
  },
]

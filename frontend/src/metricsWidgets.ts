/** Идентификаторы виджетов на странице метрик (позже — drag/resize в сетке). */
export type MetricWidgetId = 'streams-count' | 'closed-requirements'

export type MetricWidgetLayout = {
  id: MetricWidgetId
  title: string
  hint: string
  /** Заготовка под react-grid-layout: колонки сетки 1–12 */
  gridColumn?: string
  gridRow?: string
}

/** Порядок и раскладка по умолчанию; позже можно хранить в localStorage. */
export const defaultMetricWidgets: MetricWidgetLayout[] = [
  {
    id: 'streams-count',
    title: 'Стримы (доски)',
    hint: 'Количество досок TFS, подключённых к roadmap',
    gridColumn: 'span 1',
  },
  {
    id: 'closed-requirements',
    title: 'Требования в Closed',
    hint: 'Требования со статусом/колонкой Closed в загруженных ЗНИ',
    gridColumn: 'span 1',
  },
]

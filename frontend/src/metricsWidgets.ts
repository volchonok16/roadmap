/** Идентификаторы виджетов на странице метрик (позже — drag/resize в сетке). */
export type MetricWidgetId = 'streams-count' | 'closed-requirements' | 'release-shipment'

export type MetricWidgetKind = 'kpi' | 'kpi-release-chart' | 'release-chart'

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
    hint: 'Количество досок TFS, с которых собираются ЗНИ',
    gridColumn: 'span 1',
  },
  {
    id: 'closed-requirements',
    kind: 'kpi-release-chart',
    title: 'Требования в Closed',
    hint: 'Всего закрытых требований в выборке',
    gridColumn: 'span 1',
  },
  {
    id: 'release-shipment',
    kind: 'release-chart',
    title: 'Отгрузка по релизам',
    hint:
      'Закрытые требования по окну между датами релизов: (прошлый релиз → текущий]. Учитывается ранний Closed до даты релиза',
    gridColumn: '1 / -1',
  },
]

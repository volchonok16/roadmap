import { useMemo } from 'react'
import type { ReleaseHistogramData } from './metricsDashboard'
import { formatReleaseAxisLabel } from './MetricsBarChart'
import type { MetricsChartType } from './metricsChartType'
import MetricsBarChart from './MetricsBarChart'
import MetricsHistogram from './MetricsHistogram'

type MetricsReleaseChartProps = {
  chartType: MetricsChartType
  data: ReleaseHistogramData
  loading?: boolean
  emptyLabel?: string
  valueSuffix?: string
}

export default function MetricsReleaseChart({
  chartType,
  data,
  loading = false,
  emptyLabel = 'Нет данных',
  valueSuffix = '',
}: MetricsReleaseChartProps) {
  const noRelease = data.withoutRelease

  const footnote =
    noRelease.shipped > 0 ? (
      <p className="metrics-chart-foot">
        Без релиза: {noRelease.shipped.toLocaleString('ru-RU')} закрыто{valueSuffix}
        {noRelease.errors > 0 ? ` · ошибок: ${noRelease.errors.toLocaleString('ru-RU')}` : ''}
      </p>
    ) : null

  if (chartType === 'bar') {
    return (
      <div className="metrics-release-chart metrics-release-chart-bar">
        <MetricsBarChart
          data={data}
          loading={loading}
          emptyLabel={emptyLabel}
          formatLabel={formatReleaseAxisLabel}
          valueSuffix={valueSuffix}
        />
        {footnote}
      </div>
    )
  }

  return (
    <div className={`metrics-release-chart metrics-release-chart-${chartType}`}>
      <MetricsHistogram
        data={data}
        loading={loading}
        emptyLabel={emptyLabel}
        valueSuffix={valueSuffix}
        variant={chartType === 'area' ? 'area' : 'line'}
      />
      {footnote}
    </div>
  )
}

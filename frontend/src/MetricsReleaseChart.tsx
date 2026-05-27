import { useMemo } from 'react'
import type { MetricBarPoint } from './metricsCharts'
import { formatReleaseFromDashboard } from './metricsDashboard'
import type { MetricsChartType } from './metricsChartType'
import { timelineChartSeries, withoutReleaseCount } from './metricsChartSeries'
import MetricsBarChart from './MetricsBarChart'
import MetricsHistogram from './MetricsHistogram'

type MetricsReleaseChartProps = {
  chartType: MetricsChartType
  series: MetricBarPoint[]
  loading?: boolean
  emptyLabel?: string
  valueSuffix?: string
}

export default function MetricsReleaseChart({
  chartType,
  series,
  loading = false,
  emptyLabel = 'Нет данных',
  valueSuffix = '',
}: MetricsReleaseChartProps) {
  const chartSeries = useMemo(() => timelineChartSeries(series), [series])
  const noRelease = useMemo(() => withoutReleaseCount(series), [series])

  const footnote =
    noRelease > 0 ? (
      <p className="metrics-chart-foot">
        Без релиза: {noRelease.toLocaleString('ru-RU')}
        {valueSuffix}
      </p>
    ) : null

  if (chartType === 'bar') {
    return (
      <div className="metrics-release-chart metrics-release-chart-bar">
        <MetricsBarChart
          series={chartSeries}
          loading={loading}
          emptyLabel={emptyLabel}
          formatLabel={formatReleaseFromDashboard}
          valueSuffix={valueSuffix}
          variant="release"
        />
        {footnote}
      </div>
    )
  }

  return (
    <div className={`metrics-release-chart metrics-release-chart-${chartType}`}>
      <MetricsHistogram
        series={chartSeries}
        loading={loading}
        emptyLabel={emptyLabel}
        valueSuffix={valueSuffix}
        variant={chartType === 'area' ? 'area' : 'line'}
      />
      {footnote}
    </div>
  )
}

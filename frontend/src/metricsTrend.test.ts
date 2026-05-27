import { describe, expect, it } from 'vitest'
import { computeShipmentTrend } from './metricsTrend'
import type { MetricBarPoint } from './metricsCharts'

describe('computeShipmentTrend', () => {
  it('detects progression when last release has more shipments', () => {
    const series: MetricBarPoint[] = [
      { label: '2026.05.01.0-R', value: 40, sortKey: 1 },
      { label: '2026.06.02.0-R', value: 83, sortKey: 2 },
    ]
    expect(computeShipmentTrend(series)?.direction).toBe('up')
    expect(computeShipmentTrend(series)?.delta).toBe(43)
  })

  it('detects regression when last release has fewer shipments', () => {
    const series: MetricBarPoint[] = [
      { label: '2026.05.01.0-R', value: 83, sortKey: 1 },
      { label: '2026.06.02.0-R', value: 43, sortKey: 2 },
    ]
    expect(computeShipmentTrend(series)?.direction).toBe('down')
  })
})

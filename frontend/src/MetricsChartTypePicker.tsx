import { METRICS_CHART_TYPE_OPTIONS, type MetricsChartType } from './metricsChartType'

type MetricsChartTypePickerProps = {
  value: MetricsChartType
  onChange: (value: MetricsChartType) => void
  disabled?: boolean
}

export default function MetricsChartTypePicker({ value, onChange, disabled = false }: MetricsChartTypePickerProps) {
  return (
    <div className="metrics-chart-type-picker metrics-widget-no-drag" role="group" aria-label="Тип диаграммы">
      {METRICS_CHART_TYPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`metrics-chart-type-picker-btn ${value === option.value ? 'is-active' : ''}`}
          disabled={disabled}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

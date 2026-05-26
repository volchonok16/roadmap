import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import FilterDropdown from './FilterDropdown'
import { useFloatingMenuStyle } from './useFloatingMenu'

export type PeriodScale = 'year' | 'quarter' | 'month' | 'week' | 'custom'

type PeriodPickerProps = {
  scale: PeriodScale
  selectedYear: number
  selectedQuarter: number
  selectedMonth: number
  from: string
  to: string
  yearOptions: number[]
  onScaleChange: (scale: PeriodScale) => void
  onYearChange: (year: number) => void
  onQuarterChange: (quarter: number) => void
  onMonthChange: (month: number) => void
  onRangeApply: (from: string, to: string) => void
}

const modeLabels: Record<PeriodScale, string> = {
  year: 'Год',
  quarter: 'Квартал',
  month: 'Месяц',
  week: 'Неделя',
  custom: 'Свободный формат',
}

const monthShort = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function formatRuDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`
}

export function formatPeriodTriggerLabel(
  scale: PeriodScale,
  year: number,
  quarter: number,
  month: number,
  from: string,
  to: string,
) {
  const range = `${formatRuDate(from)} — ${formatRuDate(to)}`
  if (scale === 'year') return `${year} · ${range}`
  if (scale === 'quarter') return `Q${quarter} ${year} · ${range}`
  if (scale === 'month') return `${monthShort[month - 1] ?? month} ${year} · ${range}`
  if (scale === 'week') return `Неделя · ${range}`
  return range
}

export default function PeriodPicker({
  scale,
  selectedYear,
  selectedQuarter,
  selectedMonth,
  from,
  to,
  yearOptions,
  onScaleChange,
  onYearChange,
  onQuarterChange,
  onMonthChange,
  onRangeApply,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const panelStyle = useFloatingMenuStyle(open, anchorRef, panelRef, 360)
  const triggerLabel = formatPeriodTriggerLabel(scale, selectedYear, selectedQuarter, selectedMonth, from, to)

  useEffect(() => {
    if (!open) return
    setDraftFrom(from)
    setDraftTo(to)
  }, [open, from, to])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (anchorRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const yearDropdownOptions = yearOptions.map((year) => ({
    value: String(year),
    label: String(year),
  }))

  const applyCustomRange = () => {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return
    onRangeApply(draftFrom, draftTo)
    setOpen(false)
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
    }
  }

  const panel = open ? (
    <div
      id={panelId}
      ref={panelRef}
      className="period-picker-panel floating-menu-portal"
      style={panelStyle}
      role="dialog"
      aria-label="Выбор периода"
    >
      <p className="period-picker-title">Период</p>
      <div className="period-mode-switch" role="group" aria-label="Тип периода">
        {(['year', 'quarter', 'month', 'week', 'custom'] as PeriodScale[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`${scale === item ? 'active' : ''} ${item === 'custom' ? 'is-custom' : ''}`}
            aria-pressed={scale === item}
            onClick={() => onScaleChange(item)}
          >
            {modeLabels[item]}
          </button>
        ))}
      </div>

      <div className="period-picker-body">
        {scale !== 'custom' && scale !== 'week' && (
          <div className="period-picker-field">
            <span className="period-picker-field-label">Год</span>
            <FilterDropdown
              className="filter-dropdown-year period-picker-year"
              triggerClassName="filter-dropdown-trigger-year"
              ariaLabel="Год"
              value={String(selectedYear)}
              options={yearDropdownOptions}
              onChange={(next) => onYearChange(Number(next))}
            />
          </div>
        )}

        {scale === 'quarter' && (
          <div className="period-picker-field">
            <span className="period-picker-field-label">Квартал</span>
            <div className="quarter-switch period-picker-quarters" role="group" aria-label="Квартал">
              {[1, 2, 3, 4].map((quarter) => (
                <button
                  key={quarter}
                  type="button"
                  className={selectedQuarter === quarter ? 'active' : ''}
                  aria-pressed={selectedQuarter === quarter}
                  onClick={() => onQuarterChange(quarter)}
                >
                  Q{quarter}
                </button>
              ))}
            </div>
          </div>
        )}

        {scale === 'month' && (
          <div className="period-picker-field">
            <span className="period-picker-field-label">Месяц</span>
            <div className="period-month-grid" role="group" aria-label="Месяц">
              {monthShort.map((label, index) => {
                const month = index + 1
                return (
                  <button
                    key={label}
                    type="button"
                    className={selectedMonth === month ? 'active' : ''}
                    aria-pressed={selectedMonth === month}
                    onClick={() => onMonthChange(month)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {scale === 'week' && (
          <p className="period-picker-hint">Текущая календарная неделя (пн — вс).</p>
        )}

        {scale === 'custom' && (
          <div className="period-picker-field period-picker-custom">
            <span className="period-picker-field-label">Диапазон дат</span>
            <div className="period-custom-range">
              <input
                className="filter-bar-input filter-bar-date"
                type="date"
                aria-label="Дата начала"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
              />
              <span className="filter-bar-dash">—</span>
              <input
                className="filter-bar-input filter-bar-date"
                type="date"
                aria-label="Дата окончания"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </div>
            <p className="period-picker-hint">Любой интервал «с — по» для таймлайна и «Обновить».</p>
          </div>
        )}
      </div>

      {scale === 'custom' ? (
        <button
          type="button"
          className="period-picker-apply"
          disabled={!draftFrom || !draftTo || draftFrom > draftTo}
          onClick={applyCustomRange}
        >
          Применить
        </button>
      ) : (
        <button type="button" className="period-picker-apply is-secondary" onClick={() => setOpen(false)}>
          Готово
        </button>
      )}
    </div>
  ) : null

  return (
    <div className="period-picker" ref={anchorRef}>
      <button
        type="button"
        className={`period-picker-trigger ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Период на таймлайне и для выгрузки"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="period-picker-trigger-kicker">{modeLabels[scale]}</span>
        <span className="period-picker-trigger-label">{triggerLabel}</span>
        <span className="period-picker-chevron" aria-hidden />
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  )
}

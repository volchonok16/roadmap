import type { ChangeRequest } from './roadmapTypes'
import TagChips from './TagChips'
import ScheduleTimelineBar from './ScheduleTimelineBar'
import { effectiveScheduling } from './schedulingUtils'

type ZniTimelineBarProps = {
  item: ChangeRequest
  fromDate: Date
  toDate: Date
  useUserStartDate: boolean
  override?: import('./schedulingUtils').SchedulingOverride
  isPending: boolean
  statusClassName: string
  columnLabel: string
  zoneTitle: string
  formatDate: (value: string | Date) => string
  onDatesChange: (id: number, startDate: string, targetDate: string) => void
  onFocus: () => void
  renderTfsLink: (href: string | null) => React.ReactNode
  stopRowActivation: (event: React.SyntheticEvent) => void
}

export default function ZniTimelineBar({
  item,
  fromDate,
  toDate,
  useUserStartDate,
  override,
  isPending,
  statusClassName,
  columnLabel,
  zoneTitle,
  formatDate,
  onDatesChange,
  onFocus,
  renderTfsLink,
  stopRowActivation,
}: ZniTimelineBarProps) {
  const committed = effectiveScheduling(item, override, useUserStartDate)
  const zniHasTags = Boolean(item.tags?.length)

  return (
    <ScheduleTimelineBar
      fromDate={fromDate}
      toDate={toDate}
      committed={committed}
      isPending={isPending}
      draggable
      barClassName={`bar bar-zni bar-schedule ${statusClassName} ${zniHasTags ? 'bar-has-tags' : ''}`}
      title={`${zoneTitle} · колонка ${columnLabel}\n${item.title}\nСтарт ${formatDate(committed.startDate)} · план ${formatDate(committed.targetDate)}${item.tags?.length ? `\nТеги: ${item.tags.join(', ')}` : ''}${isPending ? '\nИзменено локально — нажмите «Обновить статусы в TFS»' : ''}\nКрай — изменить срок · центр — сдвинуть`}
      onDatesChange={(startDate, targetDate) => onDatesChange(item.id, startDate, targetDate)}
      onFocus={onFocus}
      footer={renderTfsLink(item.tfsUrl ?? null)}
    >
      <div className="bar-main">
        <div className="bar-text">
          <span className="bar-kind-badge bar-kind-zni">Запрос на изменение</span>
          <span className="bar-status">{columnLabel}</span>
          <span className="bar-label selectable-text" onClick={stopRowActivation} onPointerDown={stopRowActivation}>
            <b>#{item.id}</b> {item.title}
          </span>
        </div>
        <TagChips tags={item.tags ?? []} variant="bar" maxVisible={5} />
      </div>
    </ScheduleTimelineBar>
  )
}

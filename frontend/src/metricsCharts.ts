import {
  parseReleaseDateFromLabel,
  parseReleaseLabelFromTitle,
  type UpcomingRelease,
} from './releaseUtils'
import { isRequirementClosed } from './metricsSummary'
import type { ChangeRequest, Requirement } from './roadmapTypes'

export type MetricBarPoint = {
  label: string
  value: number
  highlight?: boolean
  sortKey: number
}

export type ReleaseScheduleEntry = UpcomingRelease

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function parseClosedDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return startOfDay(parsed)
}

function releaseLabelFromItem(item: ChangeRequest, requirement?: Requirement) {
  if (requirement) {
    const direct = requirement.release?.trim()
    if (direct) return direct
    const fromTitle = parseReleaseLabelFromTitle(requirement.title)
    if (fromTitle) return fromTitle
  }
  const parentRelease = item.release?.trim()
  if (parentRelease) return parentRelease
  return parseReleaseLabelFromTitle(item.title)
}

/** Все уникальные релизы из ЗНИ и требований, отсортированные по дате. */
export function collectReleaseSchedule(items: ChangeRequest[]): ReleaseScheduleEntry[] {
  const byLabel = new Map<string, Date>()
  const consider = (label: string | null | undefined) => {
    if (!label?.trim()) return
    const date = parseReleaseDateFromLabel(label.trim())
    if (!date) return
    const key = label.trim()
    if (!byLabel.has(key)) byLabel.set(key, startOfDay(date))
  }

  for (const item of items) {
    consider(releaseLabelFromItem(item))
    for (const requirement of item.requirements) {
      consider(releaseLabelFromItem(item, requirement))
    }
  }

  return [...byLabel.entries()]
    .map(([label, date]) => ({ label, date }))
    .sort((left, right) => left.date.getTime() - right.date.getTime())
}

/**
 * Отгрузка в релиз R_i: требования в Closed, у которых closedDate попадает
 * в интервал (дата предыдущего релиза, дата R_i].
 * Так учитывается ранний перевод в Closed перед датой релиза (регресс и настройки).
 */
export function releaseWindowForClosedDate(
  closedAt: Date,
  schedule: ReleaseScheduleEntry[],
  periodStart: Date,
): string | null {
  if (!schedule.length) return null
  const day = startOfDay(closedAt).getTime()
  const start = startOfDay(periodStart).getTime()

  for (let index = 0; index < schedule.length; index += 1) {
    const prev = index === 0 ? start : schedule[index - 1].date.getTime()
    const curr = schedule[index].date.getTime()
    if (day > prev && day <= curr) return schedule[index].label
  }

  const last = schedule[schedule.length - 1]
  if (day > last.date.getTime()) return last.label
  return null
}

export function shortReleaseLabel(label: string) {
  const match = label.match(/^(\d{4})\.(\d{2})\.(\d{2})/)
  if (!match) return label.length > 10 ? `${label.slice(0, 10)}…` : label
  return `${match[3]}.${match[2]}`
}

export function buildShippedTasksByRelease(
  items: ChangeRequest[],
  periodStart: Date,
  maxBars = 14,
): MetricBarPoint[] {
  const schedule = collectReleaseSchedule(items)
  if (!schedule.length) return []

  const counts = new Map(schedule.map((entry) => [entry.label, 0]))
  let withoutClosedDate = 0

  for (const item of items) {
    for (const requirement of item.requirements) {
      if (!isRequirementClosed(requirement)) continue
      const closedAt = parseClosedDate(requirement.closedDate)
      if (!closedAt) {
        withoutClosedDate += 1
        continue
      }
      const release = releaseWindowForClosedDate(closedAt, schedule, periodStart)
      if (!release) continue
      counts.set(release, (counts.get(release) ?? 0) + 1)
    }
  }

  const series = schedule
    .map((entry) => ({
      label: entry.label,
      value: counts.get(entry.label) ?? 0,
      sortKey: entry.date.getTime(),
    }))
    .filter((row) => row.value > 0)

  if (withoutClosedDate > 0) {
    series.push({
      label: 'Closed без даты',
      value: withoutClosedDate,
      sortKey: Number.MAX_SAFE_INTEGER - 1,
    })
  }

  return series.slice(-maxBars)
}

/** @deprecated Используйте buildShippedTasksByRelease */
export const buildClosedDeliveriesByRelease = buildShippedTasksByRelease

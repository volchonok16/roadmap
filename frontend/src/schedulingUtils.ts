import type { ChangeRequest, Requirement } from './roadmapTypes'

export type SchedulingOverride = {
  startDate: string
  targetDate: string
}

const dayMs = 24 * 60 * 60 * 1000

export function parseDateInput(value: string, endOfDay = false) {
  const [year, month, day] = value.split('-').map(Number)
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)
}

export function toDateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDaysToInput(value: string, days: number) {
  const next = startOfLocalDay(parseDateInput(value))
  next.setDate(next.getDate() + days)
  return toDateInput(next)
}

export function dayDiff(fromDate: string, toDate: string) {
  const fromMs = startOfLocalDay(parseDateInput(fromDate)).getTime()
  const toMs = startOfLocalDay(parseDateInput(toDate)).getTime()
  return Math.round((toMs - fromMs) / dayMs)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function timelinePercent(date: string | Date, from: Date, to: Date) {
  const total = Math.max(to.getTime() - from.getTime(), dayMs)
  return clamp(((new Date(date).getTime() - from.getTime()) / total) * 100, 0, 100)
}

export function timelineWidth(start: string | Date, end: string | Date, from: Date, to: Date) {
  return Math.max(timelinePercent(end, from, to) - timelinePercent(start, from, to), 1.4)
}

export function dateFromTimelinePercent(percent: number, from: Date, to: Date) {
  const total = Math.max(to.getTime() - from.getTime(), dayMs)
  const time = from.getTime() + (clamp(percent, 0, 100) / 100) * total
  return startOfLocalDay(new Date(time))
}

export function daysInTimelineRange(from: Date, to: Date) {
  return Math.max(Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / dayMs), 1)
}

export function barStartDate(
  startDate: string,
  userStartDate: string | null | undefined,
  useUserStartDate: boolean,
) {
  if (useUserStartDate && userStartDate) return userStartDate
  return startDate
}

export function effectiveScheduling(
  item: ChangeRequest,
  override: SchedulingOverride | undefined,
  useUserStartDate: boolean,
): SchedulingOverride {
  if (override) return override
  return {
    startDate: barStartDate(item.startDate, item.userStartDate, useUserStartDate),
    targetDate: item.targetDate,
  }
}

export function schedulingChanged(
  item: ChangeRequest,
  override: SchedulingOverride,
  useUserStartDate: boolean,
) {
  const baseline = effectiveScheduling(item, undefined, useUserStartDate)
  return baseline.startDate !== override.startDate || baseline.targetDate !== override.targetDate
}

export function effectiveRequirementScheduling(
  requirement: Requirement,
  parent: ChangeRequest,
  parentOverride: SchedulingOverride | undefined,
  reqOverride: SchedulingOverride | undefined,
  useUserStartDate: boolean,
): SchedulingOverride {
  if (reqOverride) return reqOverride
  const parentEff = effectiveScheduling(parent, parentOverride, useUserStartDate)
  return {
    startDate: requirement.startDate ?? parentEff.startDate,
    targetDate: requirement.targetDate ?? parentEff.targetDate,
  }
}

export function requirementSchedulingChanged(
  requirement: Requirement,
  parent: ChangeRequest,
  override: SchedulingOverride,
  useUserStartDate: boolean,
) {
  const baseline = effectiveRequirementScheduling(requirement, parent, undefined, undefined, useUserStartDate)
  return baseline.startDate !== override.startDate || baseline.targetDate !== override.targetDate
}

export function shiftScheduling(
  scheduling: SchedulingOverride,
  deltaStart: number,
  deltaTarget: number,
): SchedulingOverride {
  let startDate = scheduling.startDate
  let targetDate = scheduling.targetDate
  if (deltaStart !== 0) startDate = addDaysToInput(startDate, deltaStart)
  if (deltaTarget !== 0) targetDate = addDaysToInput(targetDate, deltaTarget)
  if (startDate > targetDate) targetDate = startDate
  return { startDate, targetDate }
}

export type TimelineBarVisual = {
  leftPct: number
  widthPct: number
}

const minBarWidthPct = 1.4

export function schedulingToVisual(
  startDate: string,
  targetDate: string,
  from: Date,
  to: Date,
): TimelineBarVisual {
  const leftPct = timelinePercent(startDate, from, to)
  const widthPct = timelineWidth(startDate, targetDate, from, to)
  return { leftPct, widthPct }
}

export function visualToScheduling(visual: TimelineBarVisual, from: Date, to: Date): SchedulingOverride {
  const startDate = toDateInput(dateFromTimelinePercent(visual.leftPct, from, to))
  const targetDate = toDateInput(dateFromTimelinePercent(visual.leftPct + visual.widthPct, from, to))
  return { startDate, targetDate }
}

export function pointerTimelinePercent(clientX: number, trackRect: DOMRect) {
  if (trackRect.width <= 0) return 0
  return clamp(((clientX - trackRect.left) / trackRect.width) * 100, 0, 100)
}

export function moveVisualByPointerDelta(
  origin: TimelineBarVisual,
  pointerStartX: number,
  clientX: number,
  trackRect: DOMRect,
): TimelineBarVisual {
  if (trackRect.width <= 0) return origin
  const deltaPct = ((clientX - pointerStartX) / trackRect.width) * 100
  const leftPct = clamp(origin.leftPct + deltaPct, 0, 100 - origin.widthPct)
  return { leftPct, widthPct: origin.widthPct }
}

export function resizeStartVisual(pointerPct: number, origin: TimelineBarVisual): TimelineBarVisual {
  const rightPct = origin.leftPct + origin.widthPct
  const leftPct = clamp(pointerPct, 0, rightPct - minBarWidthPct)
  return { leftPct, widthPct: rightPct - leftPct }
}

export function resizeEndVisual(pointerPct: number, origin: TimelineBarVisual): TimelineBarVisual {
  const rightPct = clamp(pointerPct, origin.leftPct + minBarWidthPct, 100)
  return { leftPct: origin.leftPct, widthPct: rightPct - origin.leftPct }
}

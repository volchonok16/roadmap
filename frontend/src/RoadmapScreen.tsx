import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ErrorsDisplayToggle, { readErrorsDisplayMode, type ErrorsDisplayMode } from './ErrorsDisplayToggle'
import ReleasesDisplayToggle, { readReleasesDisplayMode } from './ReleasesDisplayToggle'
import {
  readFavoriteBoardIds,
  readInitialSelectedBoardIds,
  readPinnedBoardId,
  sortBoardOptions,
  toggleFavoriteBoardId,
  writeFavoriteBoardIds,
  writePinnedBoardId,
  writeSelectedBoardIds,
} from './boardPreferences'
import { apiFetch, clearSessionId, getJson, getSessionId, readApiError } from './api'
import BoardMultiPicker, { formatBoardPickerLabel } from './BoardMultiPicker'
import PeriodPicker, { type PeriodScale } from './PeriodPicker'
import TagFilterStrip from './TagFilterStrip'
import ScheduleTimelineBar from './ScheduleTimelineBar'
import ZniTimelineBar from './ZniTimelineBar'
import {
  buildMergedColumnFilters,
  buildSelectedBoardColumnFilters,
  columnBarClass,
  columnColorClass,
  columnNameFilterKey,
  isColumnKeyVisible,
  isZniColumnVisible,
  zniColumnLabel,
  zniColumnOrder,
} from './kanbanColumns'
import {
  dayDiff,
  effectiveRequirementScheduling,
  effectiveScheduling,
  requirementSchedulingChanged,
  schedulingChanged,
  shiftScheduling,
  type SchedulingOverride,
} from './schedulingUtils'
import {
  buildReleaseTimelineMarkers,
  filterReleasesForDisplayMode,
  type ReleasesDisplayMode,
} from './releaseUtils'
import { zniMatchesSearch } from './zniSearch'
import RoadmapGrid, { type BoardGroup, type SidebarHead } from './RoadmapGrid'
import type { TaskRow } from './RoadmapGrid'
import {
  linkedErrorsForChangeRequest,
  linkedErrorsForRequirement,
  normalizeRoadmapItems,
} from './linkedErrors'
import {
  isRequirementLikeColumnVisible,
  linkedErrorColumnLabel,
  normalizeRequirementColumn,
  requirementColumnLabel,
  requirementColumnOrder,
} from './requirementColumns'
import type { ChangeRequest, LinkedError, Requirement } from './roadmapTypes'
import './App.css'

type Board = {
  id: string
  name: string
  areaPath?: string | null
  columns?: string[]
}

type RoadmapResponse = {
  boards: Board[]
  items: ChangeRequest[]
  generatedAt: string
}

type SyncRun = {
  id: number
  status: string
  message?: string | null
  boardsCount?: number
  changeRequestsCount?: number
  startedAt: string
  finishedAt?: string | null
}

type Scale = PeriodScale

const dayMs = 24 * 60 * 60 * 1000

const SIDEBAR_WIDTH_KEY = 'roadmap-sidebar-width'
const USE_USER_START_DATE_KEY = 'roadmap-use-user-start-date'
const REQUIREMENT_SORT_KEY = 'roadmap-requirement-sort'
const REQUIREMENT_SORT_STATUS_KEY = 'roadmap-requirement-sort-status'
const REQUIREMENT_SORT_DATE_KEY = 'roadmap-requirement-sort-date'
const SELECTED_TAGS_KEY = 'roadmap-selected-tags'
const ZNI_SEARCH_KEY = 'roadmap-zni-search'
const SHOW_RELEASES_KEY = 'roadmap-show-releases'
const RELEASES_DISPLAY_MODE_KEY = 'roadmap-releases-display-mode'
const SHOW_ERRORS_KEY = 'roadmap-show-errors'
const ERRORS_DISPLAY_MODE_KEY = 'roadmap-errors-display-mode'

type RequirementSortAxes = {
  byStatus: boolean
  byDate: boolean
}
const SIDEBAR_MIN_WIDTH = 260
const SIDEBAR_MAX_WIDTH = 480

function readSidebarWidth() {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  if (Number.isFinite(saved) && saved >= SIDEBAR_MIN_WIDTH && saved <= SIDEBAR_MAX_WIDTH) {
    return saved
  }
  return 300
}

function readUseUserStartDate() {
  return localStorage.getItem(USE_USER_START_DATE_KEY) === '1'
}

function readShowReleases() {
  const saved = localStorage.getItem(SHOW_RELEASES_KEY)
  if (saved === '0') return false
  return true
}

function readShowErrors() {
  const saved = localStorage.getItem(SHOW_ERRORS_KEY)
  if (saved === '0') return false
  return true
}

function readRequirementSortAxes(): RequirementSortAxes {
  const statusSaved = localStorage.getItem(REQUIREMENT_SORT_STATUS_KEY)
  const dateSaved = localStorage.getItem(REQUIREMENT_SORT_DATE_KEY)
  if (statusSaved !== null || dateSaved !== null) {
    return {
      byStatus: statusSaved !== '0',
      byDate: dateSaved !== '0',
    }
  }
  const legacy = localStorage.getItem(REQUIREMENT_SORT_KEY)
  if (legacy === 'date') return { byStatus: false, byDate: true }
  if (legacy === 'both') return { byStatus: true, byDate: true }
  return { byStatus: true, byDate: false }
}

function toggleRequirementSortAxis(axes: RequirementSortAxes, axis: keyof RequirementSortAxes): RequirementSortAxes {
  const next = { ...axes, [axis]: !axes[axis] }
  if (!next.byStatus && !next.byDate) return axes
  return next
}

function readSelectedTags(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_TAGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function isItemVisibleByTags(item: ChangeRequest, selectedTags: string[]) {
  if (!selectedTags.length) return true
  const tags = item.tags ?? []
  if (!tags.length) return false
  return tags.some((tag) => selectedTags.includes(tag))
}

function collectTagsFromItems(items: ChangeRequest[]) {
  const result = new Set<string>()
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const trimmed = tag.trim()
      if (trimmed) result.add(trimmed)
    }
  }
  return Array.from(result).sort((left, right) => left.localeCompare(right, 'ru'))
}

function hasUserStartDate(item: ChangeRequest) {
  return Boolean(item.userStartDate)
}

function visibleRequirements(requirements: Requirement[], hiddenColumnKeys: string[]) {
  return requirements.filter((requirement) =>
    isRequirementLikeColumnVisible(requirement, hiddenColumnKeys),
  )
}

function requirementStatusSortIndex(state: string) {
  const normalized = state.trim()
  const exact = zniColumnOrder.findIndex((item) => item.toLowerCase() === normalized.toLowerCase())
  if (exact >= 0) return exact
  const lower = normalized.toLowerCase()
  if (lower.includes('new')) return 0
  if (lower.includes('closed') || lower.includes('done') || lower.includes('merged')) return zniColumnOrder.length - 1
  if (lower.includes('pilot')) return zniColumnOrder.indexOf('Pilot')
  if (lower.includes('uat') || lower.includes('test')) return zniColumnOrder.indexOf('UAT')
  if (lower.includes('develop') || lower.includes('code-review')) return zniColumnOrder.indexOf('Development')
  if (lower.includes('express')) return zniColumnOrder.indexOf('Express Analysis')
  if (lower.includes('architecture')) return zniColumnOrder.indexOf('Analysis')
  if (lower.includes('backlog') && lower.includes('analysis')) return zniColumnOrder.indexOf('Analysis Backlog')
  if (lower.includes('backlog')) return zniColumnOrder.indexOf('Backlog')
  if (lower.includes('analysis') || lower.includes('analyt') || lower.includes('review')) return zniColumnOrder.indexOf('Analysis')
  return zniColumnOrder.length
}

function requirementColumnSortIndex(label: string) {
  const normalized = normalizeRequirementColumn(label)
  const exact = requirementColumnOrder.findIndex(
    (item) => item.toLowerCase() === normalized.toLowerCase(),
  )
  if (exact >= 0) return exact
  const lower = normalized.toLowerCase()
  if (lower.includes('accept')) return requirementColumnOrder.indexOf('Acceptance')
  if (lower.includes('merge') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Merge-Backlog')
  if (lower.includes('merge')) return requirementColumnOrder.indexOf('Merge')
  if (lower.includes('test') && lower.includes('review')) return requirementColumnOrder.indexOf('Test Review')
  if (lower.includes('test') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Test Backlog')
  if (lower === 'test' || lower.startsWith('test ')) return requirementColumnOrder.indexOf('Test')
  if (lower.includes('code') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Code Review Backlog')
  if (lower.includes('code') && lower.includes('review')) return requirementColumnOrder.indexOf('Code Review')
  if (lower.includes('develop') && lower.includes('backlog')) return requirementColumnOrder.indexOf('Development Backlog')
  if (lower.includes('develop')) return requirementColumnOrder.indexOf('Development')
  if (lower.includes('requirement') && lower.includes('review')) return requirementColumnOrder.indexOf('Requirement Review')
  if (lower.includes('full') && lower.includes('analysis')) return requirementColumnOrder.indexOf('Full Analysis')
  if (lower.includes('backlog')) return requirementColumnOrder.indexOf('Backlog')
  if (lower.includes('closed')) return requirementColumnOrder.indexOf('Closed')
  return requirementColumnOrder.length + requirementStatusSortIndex(normalized)
}

function requirementStatusLaneFraction(label: string) {
  const maxIdx = Math.max(requirementColumnOrder.length - 1, 1)
  return clamp(requirementColumnSortIndex(label) / maxIdx, 0, 1)
}

function zniSpanOnTimeline(
  parent: ChangeRequest,
  fromDate: Date,
  toDate: Date,
  useUserStartDate: boolean,
  parentOverride?: SchedulingOverride,
) {
  const effective = effectiveScheduling(parent, parentOverride, useUserStartDate)
  return {
    left: progressLeft(effective.startDate, fromDate, toDate),
    width: progressWidth(effective.startDate, effective.targetDate, fromDate, toDate),
  }
}

type RequirementBarLayout =
  | { mode: 'date'; left: number; width: number; span: null }
  | { mode: 'status'; left: number; width: number; span: { left: number; width: number } }
  | { mode: 'combined'; left: number; width: number; span: null }

function requirementDateBarOnTimeline(
  reqStart: string,
  reqEnd: string,
  fromDate: Date,
  toDate: Date,
) {
  return {
    left: progressLeft(reqStart, fromDate, toDate),
    width: progressWidth(reqStart, reqEnd, fromDate, toDate),
  }
}

function requirementTimelineBarLayout(
  requirement: Requirement,
  parent: ChangeRequest,
  fromDate: Date,
  toDate: Date,
  useUserStartDate: boolean,
  sortAxes: RequirementSortAxes,
  schedulingOverrides: Record<number, SchedulingOverride>,
): RequirementBarLayout {
  const effective = effectiveRequirementScheduling(
    requirement,
    parent,
    schedulingOverrides[parent.id],
    schedulingOverrides[requirement.id],
    useUserStartDate,
  )

  // По дате (или оба): колбаска от Start Date до плановой/конечной даты на шкале времени.
  if (sortAxes.byDate) {
    const bar = requirementDateBarOnTimeline(effective.startDate, effective.targetDate, fromDate, toDate)
    return {
      mode: sortAxes.byStatus ? 'combined' : 'date',
      left: bar.left,
      width: bar.width,
      span: null,
    }
  }

  // Только по статусу: компактный маркер внутри срока ЗНИ (New слева → Closed справа).
  const span = zniSpanOnTimeline(
    parent,
    fromDate,
    toDate,
    useUserStartDate,
    schedulingOverrides[parent.id],
  )
  const pillWidth = clamp(span.width * 0.2, 8, Math.min(span.width * 0.85, 22))
  const avail = Math.max(span.width - pillWidth, 0)
    const fraction = requirementStatusLaneFraction(requirementColumnLabel(requirement))
  const innerLeft = fraction >= 0.999 ? avail : fraction * avail

  return {
    mode: 'status',
    left: span.left + innerLeft,
    width: pillWidth,
    span,
  }
}

function errorTimelineBarLayout(
  error: { column?: string | null; state: string; title: string },
  parent: ChangeRequest,
  fromDate: Date,
  toDate: Date,
  useUserStartDate: boolean,
  sortAxes: RequirementSortAxes,
  schedulingOverrides: Record<number, SchedulingOverride>,
  errorsDisplayMode: ErrorsDisplayMode,
) {
  const span = zniSpanOnTimeline(parent, fromDate, toDate, useUserStartDate, schedulingOverrides[parent.id])
  const label = errorColumnLabel(error)
  const laneByStatus = sortAxes.byStatus && errorsDisplayMode === 'merged'
  if (laneByStatus) {
    const fraction = requirementStatusLaneFraction(label)
    const pillWidth = Math.max(span.width * 0.12, 5)
    const innerLeft = Math.max(0, span.width * fraction * 0.86)
    return { span, left: span.left + innerLeft, width: pillWidth, byStatus: true as const, label }
  }
  return {
    span,
    left: span.left + span.width * 0.08,
    width: Math.max(span.width * 0.28, 8),
    byStatus: false as const,
    label,
  }
}

function requirementSortStart(
  requirement: Requirement,
  parent: ChangeRequest,
  useUserStartDate: boolean,
  schedulingOverrides: Record<number, SchedulingOverride>,
) {
  const effective = effectiveRequirementScheduling(
    requirement,
    parent,
    schedulingOverrides[parent.id],
    schedulingOverrides[requirement.id],
    useUserStartDate,
  )
  return new Date(effective.startDate).getTime()
}

function sortedVisibleRequirements(
  requirements: Requirement[],
  parent: ChangeRequest,
  hiddenColumnKeys: string[],
  sortAxes: RequirementSortAxes,
  useUserStartDate: boolean,
  schedulingOverrides: Record<number, SchedulingOverride>,
) {
  const visible = visibleRequirements(requirements, hiddenColumnKeys)
  const sorted = [...visible]
  sorted.sort((a, b) => {
    if (sortAxes.byStatus) {
      const byState =
        requirementColumnSortIndex(requirementColumnLabel(a)) -
        requirementColumnSortIndex(requirementColumnLabel(b))
      if (byState !== 0) return byState
    }
    if (sortAxes.byDate) {
      const byDate =
        requirementSortStart(a, parent, useUserStartDate, schedulingOverrides) -
        requirementSortStart(b, parent, useUserStartDate, schedulingOverrides)
      if (byDate !== 0) return byDate
    }
    return a.id - b.id
  })
  return sorted
}

function errorColumnLabel(error: LinkedError) {
  return linkedErrorColumnLabel(error)
}

function taskRowStatusLabel(row: TaskRow) {
  if (row.type === 'requirement') return requirementColumnLabel(row.requirement)
  if (row.type === 'error') return errorColumnLabel(row.error)
  return ''
}

function taskRowStatusSortIndex(row: TaskRow) {
  return requirementColumnSortIndex(taskRowStatusLabel(row))
}

function childRowSortStart(
  row: TaskRow,
  parent: ChangeRequest,
  useUserStartDate: boolean,
  schedulingOverrides: Record<number, SchedulingOverride>,
) {
  if (row.type === 'requirement') {
    return requirementSortStart(row.requirement, parent, useUserStartDate, schedulingOverrides)
  }
  if (row.type === 'error' && row.requirement) {
    return requirementSortStart(row.requirement, parent, useUserStartDate, schedulingOverrides)
  }
  const effective = effectiveScheduling(parent, schedulingOverrides[parent.id], useUserStartDate)
  return new Date(effective.startDate).getTime()
}

function childRowSortId(row: TaskRow) {
  if (row.type === 'requirement') return row.requirement.id
  if (row.type === 'error') return row.error.id
  return row.item.id
}

function childRowKindOrder(row: TaskRow) {
  if (row.type === 'requirement') return 0
  if (row.type === 'error') return 1
  return 2
}

function compareChildTaskRows(
  a: TaskRow,
  b: TaskRow,
  parent: ChangeRequest,
  sortAxes: RequirementSortAxes,
  useUserStartDate: boolean,
  schedulingOverrides: Record<number, SchedulingOverride>,
) {
  const byStatus = taskRowStatusSortIndex(a) - taskRowStatusSortIndex(b)
  if (byStatus !== 0) return byStatus
  if (sortAxes.byDate) {
    const byDate =
      childRowSortStart(a, parent, useUserStartDate, schedulingOverrides) -
      childRowSortStart(b, parent, useUserStartDate, schedulingOverrides)
    if (byDate !== 0) return byDate
  }
  const byKind = childRowKindOrder(a) - childRowKindOrder(b)
  if (byKind !== 0) return byKind
  return childRowSortId(a) - childRowSortId(b)
}

function buildTaskRows(
  item: ChangeRequest,
  hiddenColumnKeys: string[],
  expandedZniIds: Set<number>,
  sortAxes: RequirementSortAxes,
  useUserStartDate: boolean,
  schedulingOverrides: Record<number, SchedulingOverride>,
  showErrors: boolean,
  errorsDisplayMode: ErrorsDisplayMode,
) {
  const rows: TaskRow[] = [{ type: 'zni', item }]
  if (!expandedZniIds.has(item.id)) return rows

  if (!showErrors) {
    for (const requirement of sortedVisibleRequirements(
      item.requirements,
      item,
      hiddenColumnKeys,
      sortAxes,
      useUserStartDate,
      schedulingOverrides,
    )) {
      rows.push({ type: 'requirement', item, requirement })
    }
    return rows
  }

  if (errorsDisplayMode === 'block') {
    for (const requirement of sortedVisibleRequirements(
      item.requirements,
      item,
      hiddenColumnKeys,
      sortAxes,
      useUserStartDate,
      schedulingOverrides,
    )) {
      rows.push({ type: 'requirement', item, requirement })
      for (const error of linkedErrorsForRequirement(requirement, hiddenColumnKeys)) {
        rows.push({ type: 'error', item, requirement, error })
      }
    }
    for (const error of linkedErrorsForChangeRequest(item, hiddenColumnKeys)) {
      rows.push({ type: 'error', item, error })
    }
    return rows
  }

  const children: TaskRow[] = []
  const visible = visibleRequirements(item.requirements, hiddenColumnKeys)
  for (const requirement of visible) {
    children.push({ type: 'requirement', item, requirement })
    for (const error of linkedErrorsForRequirement(requirement, hiddenColumnKeys)) {
      children.push({ type: 'error', item, requirement, error })
    }
  }
  for (const error of linkedErrorsForChangeRequest(item, hiddenColumnKeys)) {
    children.push({ type: 'error', item, error })
  }
  children.sort((left, right) =>
    compareChildTaskRows(left, right, item, sortAxes, useUserStartDate, schedulingOverrides),
  )
  rows.push(...children)
  return rows
}

function requirementDatesLabel(
  requirement: Requirement,
  parent: ChangeRequest,
  schedulingOverrides: Record<number, SchedulingOverride>,
  useUserStartDate: boolean,
) {
  const effective = effectiveRequirementScheduling(
    requirement,
    parent,
    schedulingOverrides[parent.id],
    schedulingOverrides[requirement.id],
    useUserStartDate,
  )
  const inherited =
    !requirement.startDate && !requirement.targetDate && !schedulingOverrides[requirement.id]
  const text = `старт ${formatDate(effective.startDate)} · план ${formatDate(effective.targetDate)}`
  const pending = schedulingOverrides[requirement.id] ? ' · изменено' : ''
  return (inherited ? `${text} (как у ЗНИ)` : text) + pending
}

function taskRowKey(row: TaskRow) {
  if (row.type === 'zni') return `zni-${row.item.id}`
  if (row.type === 'requirement') return `req-${row.requirement.id}`
  return `err-${row.error.id}-${row.requirement?.id ?? 'zni'}-${row.item.id}`
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value))
}

function toDateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function parseLocalDate(value: string, endOfDay = false) {
  const [year, month, day] = value.split('-').map(Number)
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)
}

function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function progressLeft(date: string | Date, from: Date, to: Date) {
  const total = Math.max(to.getTime() - from.getTime(), dayMs)
  return clamp(((new Date(date).getTime() - from.getTime()) / total) * 100, 0, 100)
}

function progressWidth(start: string | Date, end: string | Date, from: Date, to: Date) {
  return Math.max(progressLeft(end, from, to) - progressLeft(start, from, to), 1.4)
}

function monthTicks(from: Date, to: Date) {
  const ticks: { label: string; left: number }[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
  if (cursor < from) cursor.setMonth(cursor.getMonth() + 1)

  while (cursor <= to) {
    ticks.push({
      label: new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(cursor),
      left: progressLeft(cursor, from, to),
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return ticks
}

function dayTickStep(totalDays: number, scale: Scale) {
  if (scale === 'week') return 1
  if (scale === 'month') return totalDays > 35 ? 2 : 1
  if (scale === 'quarter' || scale === 'custom') {
    if (totalDays > 75) return 3
    if (totalDays > 45) return 2
    return 1
  }
  return Math.max(1, Math.floor(totalDays / 20))
}

function dayTicks(from: Date, to: Date, scale: Scale) {
  const ticks: { label: string; left: number; isFirstOfMonth: boolean }[] = []
  const cursor = startOfLocalDay(from)
  const end = startOfLocalDay(to)
  const totalDays = Math.max(Math.round((end.getTime() - cursor.getTime()) / dayMs) + 1, 1)
  const step = dayTickStep(totalDays, scale)

  while (cursor <= end) {
    ticks.push({
      label: String(cursor.getDate()),
      left: progressLeft(cursor, from, to),
      isFirstOfMonth: cursor.getDate() === 1,
    })
    cursor.setDate(cursor.getDate() + step)
  }

  return ticks
}

function workItemHref(item: { id: number; tfsUrl?: string | null }) {
  const url = item.tfsUrl?.trim()
  if (!url || url === '#') return null
  return url
}

function stopRowActivation(event: React.SyntheticEvent) {
  event.stopPropagation()
}

function TfsLink({ href, className = '' }: { href: string; className?: string }) {
  return (
    <a
      className={`tfs-link ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Открыть в TFS"
      onClick={stopRowActivation}
      onPointerDown={stopRowActivation}
    >
      <span aria-hidden="true">↗</span>
    </a>
  )
}

function mergeBoardOptions(boards: Board[], roadmapBoards?: Board[] | null) {
  const merged = new Map<string, Board>()
  for (const board of boards) merged.set(board.id, board)
  for (const board of roadmapBoards ?? []) merged.set(board.id, board)
  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, 'ru'))
}

function zoneTitle(item: ChangeRequest) {
  return item.boardName ?? item.areaPath ?? 'Без зоны'
}

function itemMatchesSelectedBoards(item: ChangeRequest, selectedBoardIds: string[]) {
  if (!selectedBoardIds.length) return true
  if (item.boardId && selectedBoardIds.includes(item.boardId)) return true
  if (item.areaPath) {
    const areaKey = `area:${item.areaPath}`
    if (selectedBoardIds.includes(areaKey)) return true
  }
  return false
}

function groupByBoard(items: ChangeRequest[]): BoardGroup[] {
  const result = new Map<string, BoardGroup>()
  for (const item of items) {
    const key = item.boardId ?? item.areaPath ?? 'none'
    const group = result.get(key) ?? {
      key,
      title: zoneTitle(item),
      areaPath: item.areaPath ?? null,
      items: [],
    }
    group.items.push(item)
    result.set(key, group)
  }
  return Array.from(result.values())
}

function currentQuarter(date = new Date()) {
  return Math.floor(date.getMonth() / 3) + 1
}

function quarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3
  return {
    from: toDateInput(new Date(year, startMonth, 1)),
    to: toDateInput(new Date(year, startMonth + 3, 0)),
  }
}

function yearOptions(anchor = new Date().getFullYear()) {
  return Array.from({ length: 7 }, (_, index) => anchor - 2 + index)
}

type RoadmapScreenProps = { onLogout: () => void }

function RoadmapScreen({ onLogout }: RoadmapScreenProps) {
  const [data, setData] = useState<RoadmapResponse | null>(null)
  const [syncRun, setSyncRun] = useState<SyncRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoardIds, setSelectedBoardIds] = useState(readInitialSelectedBoardIds)
  const [favoriteBoardIds, setFavoriteBoardIds] = useState(readFavoriteBoardIds)
  const [pinnedBoardId, setPinnedBoardId] = useState(readPinnedBoardId)
  const pinAppliedRef = useRef(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter())
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1)
  const [scale, setScale] = useState<Scale>('quarter')
  const [from, setFrom] = useState(() => quarterRange(new Date().getFullYear(), currentQuarter()).from)
  const [to, setTo] = useState(() => quarterRange(new Date().getFullYear(), currentQuarter()).to)

  const fromDate = useMemo(() => parseLocalDate(from), [from])
  const toDate = useMemo(() => parseLocalDate(to, true), [to])
  const timelineRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [expandedZniIds, setExpandedZniIds] = useState<Set<number>>(() => new Set())
  const dragStateRef = useRef<{ startX: number; from: string; to: string } | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [selectedRequirementId, setSelectedRequirementId] = useState<number | null>(null)
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>(readSelectedTags)
  const [zniSearchQuery, setZniSearchQuery] = useState(() => {
    try {
      return localStorage.getItem(ZNI_SEARCH_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth)
  const [useUserStartDate, setUseUserStartDate] = useState(readUseUserStartDate)
  const [showReleases, setShowReleases] = useState(readShowReleases)
  const [releasesDisplayMode, setReleasesDisplayMode] = useState<ReleasesDisplayMode>(readReleasesDisplayMode)
  const [showErrors, setShowErrors] = useState(readShowErrors)
  const [errorsDisplayMode, setErrorsDisplayMode] = useState<ErrorsDisplayMode>(readErrorsDisplayMode)
  const [requirementSortAxes, setRequirementSortAxes] = useState<RequirementSortAxes>(readRequirementSortAxes)
  const [schedulingOverrides, setSchedulingOverrides] = useState<Record<number, SchedulingOverride>>({})
  const [pushingScheduling, setPushingScheduling] = useState(false)
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const lastPanDaysRef = useRef(0)
  const [isPanning, setIsPanning] = useState(false)

  const toggleHiddenColumn = useCallback((column: string) => {
    const key = columnNameFilterKey(column)
    setHiddenColumnKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    )
  }, [])

  const toggleSelectedTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }, [])

  const toggleZniExpanded = useCallback((zniId: number) => {
    setExpandedZniIds((prev) => {
      const next = new Set(prev)
      if (next.has(zniId)) next.delete(zniId)
      else next.add(zniId)
      return next
    })
  }, [])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem(USE_USER_START_DATE_KEY, useUserStartDate ? '1' : '0')
  }, [useUserStartDate])

  useEffect(() => {
    localStorage.setItem(SHOW_RELEASES_KEY, showReleases ? '1' : '0')
  }, [showReleases])

  useEffect(() => {
    localStorage.setItem(RELEASES_DISPLAY_MODE_KEY, releasesDisplayMode)
  }, [releasesDisplayMode])

  useEffect(() => {
    localStorage.setItem(SHOW_ERRORS_KEY, showErrors ? '1' : '0')
  }, [showErrors])

  useEffect(() => {
    localStorage.setItem(ERRORS_DISPLAY_MODE_KEY, errorsDisplayMode)
  }, [errorsDisplayMode])

  useEffect(() => {
    localStorage.setItem(SELECTED_TAGS_KEY, JSON.stringify(selectedTags))
  }, [selectedTags])

  useEffect(() => {
    localStorage.setItem(ZNI_SEARCH_KEY, zniSearchQuery)
  }, [zniSearchQuery])

  useEffect(() => {
    localStorage.setItem(REQUIREMENT_SORT_STATUS_KEY, requirementSortAxes.byStatus ? '1' : '0')
    localStorage.setItem(REQUIREMENT_SORT_DATE_KEY, requirementSortAxes.byDate ? '1' : '0')
    const legacyMode =
      requirementSortAxes.byStatus && requirementSortAxes.byDate
        ? 'both'
        : requirementSortAxes.byDate
          ? 'date'
          : 'status'
    localStorage.setItem(REQUIREMENT_SORT_KEY, legacyMode)
  }, [requirementSortAxes])

  const buildTaskRowsForGrid = useCallback(
    (item: ChangeRequest, hidden: string[], expanded: Set<number>) =>
      buildTaskRows(
        item,
        hidden,
        expanded,
        requirementSortAxes,
        useUserStartDate,
        schedulingOverrides,
        showErrors,
        errorsDisplayMode,
      ),
    [requirementSortAxes, useUserStartDate, schedulingOverrides, showErrors, errorsDisplayMode],
  )

  useEffect(() => {
    writeSelectedBoardIds(selectedBoardIds)
  }, [selectedBoardIds])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const resize = sidebarResizeRef.current
      if (!resize) return
      const next = clamp(resize.startWidth + (event.clientX - resize.startX), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH)
      setSidebarWidth(next)
    }
    const onPointerUp = () => {
      sidebarResizeRef.current = null
      document.body.classList.remove('is-resizing-sidebar')
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  const loadBoards = useCallback(async (refreshFromTfs = false) => {
    try {
      if (refreshFromTfs) {
        const response = await apiFetch('/api/boards/refresh', { method: 'POST' })
        if (!response.ok) throw new Error(await response.text())
        setBoards((await response.json()) as Board[])
        return
      }
      const items = await getJson<Board[]>('/api/boards')
      if (items.length) {
        setBoards(items)
        return
      }
      const response = await apiFetch('/api/boards/refresh', { method: 'POST' })
      if (!response.ok) throw new Error(await response.text())
      setBoards((await response.json()) as Board[])
    } catch {
      /* список досок подтянется после синхронизации */
    }
  }, [])

  useEffect(() => {
    void loadBoards(true)
  }, [loadBoards])

  useEffect(() => {
    if (!boards.length || pinAppliedRef.current) return
    const initial = readInitialSelectedBoardIds()
    if (initial.length && initial.every((id) => boards.some((board) => board.id === id))) {
      setSelectedBoardIds(initial)
    }
    pinAppliedRef.current = true
  }, [boards])

  const loadRoadmap = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to })
      for (const id of selectedBoardIds) params.append('board_id', id)
      const roadmap = await getJson<RoadmapResponse>(`/api/roadmap?${params}`)
      setData({ ...roadmap, items: normalizeRoadmapItems(roadmap.items ?? []) })
      if (roadmap.boards.length) {
        setBoards((prev) => {
          const merged = new Map(prev.map((board) => [board.id, board]))
          for (const board of roadmap.boards) merged.set(board.id, board)
          return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name, 'ru'))
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить roadmap')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRoadmap()
  }, [selectedBoardIds, from, to])

  const applyPeriodForScale = useCallback(
    (nextScale: Scale, year: number, quarter: number, month: number) => {
      if (nextScale === 'custom') return
      if (nextScale === 'year') {
        setFrom(`${year}-01-01`)
        setTo(`${year}-12-31`)
        return
      }
      if (nextScale === 'quarter') {
        const range = quarterRange(year, quarter)
        setFrom(range.from)
        setTo(range.to)
        return
      }
      if (nextScale === 'month') {
        setFrom(toDateInput(new Date(year, month - 1, 1)))
        setTo(toDateInput(new Date(year, month, 0)))
        return
      }
      if (nextScale === 'week') {
        const now = new Date()
        const start = addDays(now, -now.getDay() + 1)
        setFrom(toDateInput(start))
        setTo(toDateInput(addDays(start, 6)))
      }
    },
    [],
  )

  useEffect(() => {
    if (scale === 'custom') return
    applyPeriodForScale(scale, selectedYear, selectedQuarter, selectedMonth)
  }, [scale, selectedYear, selectedQuarter, selectedMonth, applyPeriodForScale])

  const pollSync = async (runId: number) => {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 800 : 2000))
      const latest = await getJson<SyncRun | null>('/api/sync/runs/latest')
      if (!latest || latest.id !== runId) continue
      setSyncRun(latest)
      if (latest.status !== 'running') {
        return latest
      }
    }
    throw new Error('Выгрузка заняла слишком много времени (30+ мин). Проверьте логи backend.')
  }

  const runSync = async (mode: 'period' | 'full') => {
    if (!getSessionId()) {
      onLogout()
      return
    }

    setSyncing(true)
    setError(null)
    try {
      const body =
        mode === 'period'
          ? JSON.stringify({ mode: 'period', from, to })
          : JSON.stringify({ mode: 'full' })
      const response = await apiFetch('/api/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (response.status === 401) {
        clearSessionId()
        onLogout()
        return
      }
      if (!response.ok) throw new Error(await response.text())
      const run = (await response.json()) as SyncRun
      setSyncRun(run)
      const finished = run.status === 'running' ? await pollSync(run.id) : run
      if (finished.status === 'failed') {
        throw new Error(finished.message ?? 'Выгрузка завершилась с ошибкой')
      }
      await loadBoards(true)
      await loadRoadmap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить выгрузку')
    } finally {
      setSyncing(false)
    }
  }

  const logout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    clearSessionId()
    onLogout()
  }

  const shiftTimelineByDays = useCallback((days: number, baseFrom = from, baseTo = to) => {
    const nextFrom = addDays(parseLocalDate(baseFrom), days)
    const nextTo = addDays(parseLocalDate(baseTo, true), days)
    setFrom(toDateInput(nextFrom))
    setTo(toDateInput(nextTo))
  }, [from, to])

  const boardOptions = sortBoardOptions(
    mergeBoardOptions(boards, data?.boards),
    favoriteBoardIds,
    pinnedBoardId,
  )
  const singleSelectedBoardId = selectedBoardIds.length === 1 ? selectedBoardIds[0] : null

  const handlePeriodScaleChange = (nextScale: Scale) => {
    setScale(nextScale)
    if (nextScale !== 'custom') {
      applyPeriodForScale(nextScale, selectedYear, selectedQuarter, selectedMonth)
    }
  }

  const handlePeriodYearChange = (year: number) => {
    setSelectedYear(year)
    if (scale !== 'custom' && scale !== 'week') {
      applyPeriodForScale(scale, year, selectedQuarter, selectedMonth)
    }
  }

  const handlePeriodQuarterChange = (quarter: number) => {
    setSelectedQuarter(quarter)
    setScale('quarter')
    applyPeriodForScale('quarter', selectedYear, quarter, selectedMonth)
  }

  const handlePeriodMonthChange = (month: number) => {
    setSelectedMonth(month)
    setScale('month')
    applyPeriodForScale('month', selectedYear, selectedQuarter, month)
  }

  const canPinBoard = Boolean(singleSelectedBoardId)
  const isBoardFavorite = canPinBoard && favoriteBoardIds.includes(singleSelectedBoardId!)
  const isBoardPinned = canPinBoard && pinnedBoardId === singleSelectedBoardId

  const toggleFavoriteBoard = () => {
    if (!singleSelectedBoardId) return
    const next = toggleFavoriteBoardId(singleSelectedBoardId, favoriteBoardIds)
    setFavoriteBoardIds(next)
    writeFavoriteBoardIds(next)
    if (pinnedBoardId === singleSelectedBoardId && !next.includes(singleSelectedBoardId)) {
      setPinnedBoardId(null)
      writePinnedBoardId(null)
    }
  }

  const togglePinBoard = () => {
    if (!singleSelectedBoardId) return
    const next = isBoardPinned ? null : singleSelectedBoardId
    setPinnedBoardId(next)
    writePinnedBoardId(next)
    if (next && !favoriteBoardIds.includes(next)) {
      const favorites = [...favoriteBoardIds, next]
      setFavoriteBoardIds(favorites)
      writeFavoriteBoardIds(favorites)
    }
  }
  const monthRulerTicks = monthTicks(fromDate, toDate)
  const dayRulerTicks = dayTicks(fromDate, toDate, scale)
  const today = startOfLocalDay()
  const todayLeft = progressLeft(today, fromDate, toDate)
  const isTodayVisible = today >= fromDate && today <= toDate
  const canPanTimeline =
    scale === 'quarter' || scale === 'month' || scale === 'week' || scale === 'custom'
  const totalItems = data?.items
  const startDateScopedItems = useMemo(() => {
    const items = totalItems ?? []
    return useUserStartDate ? items.filter((item) => hasUserStartDate(item)) : items
  }, [totalItems, useUserStartDate])
  const selectedBoardIdsKey = selectedBoardIds.join(',')
  const boardScopedItems = useMemo(
    () => startDateScopedItems.filter((item) => itemMatchesSelectedBoards(item, selectedBoardIds)),
    [startDateScopedItems, selectedBoardIdsKey],
  )
  const availableTags = useMemo(() => collectTagsFromItems(boardScopedItems), [boardScopedItems])
  const activeSelectedTags = useMemo(() => {
    if (!selectedTags.length) return selectedTags
    const allowed = new Set(availableTags)
    return selectedTags.filter((tag) => allowed.has(tag))
  }, [selectedTags, availableTags])
  const tagScopedItems = boardScopedItems.filter((item) => isItemVisibleByTags(item, activeSelectedTags))
  const searchScopedItems = useMemo(
    () => tagScopedItems.filter((item) => zniMatchesSearch(item, zniSearchQuery)),
    [tagScopedItems, zniSearchQuery],
  )
  const columnFiltersByBoard = useMemo(
    () => buildSelectedBoardColumnFilters(searchScopedItems, data?.boards ?? [], selectedBoardIds),
    [searchScopedItems, data?.boards, selectedBoardIds],
  )
  const useMergedColumnFilters = columnFiltersByBoard.length > 1
  const mergedColumnFilters = useMemo(
    () => buildMergedColumnFilters(columnFiltersByBoard),
    [columnFiltersByBoard],
  )
  const tagFilteredItems = searchScopedItems.filter((item) => isZniColumnVisible(item, hiddenColumnKeys))
  const releaseMarkers = useMemo(
    () =>
      buildReleaseTimelineMarkers(tagFilteredItems, today, fromDate, toDate, (date, from, to) =>
        progressLeft(date, from, to),
      ),
    [tagFilteredItems, today, fromDate, toDate],
  )
  const visibleReleaseMarkers = useMemo(() => {
    if (!showReleases) return []
    const filtered = filterReleasesForDisplayMode(
      releaseMarkers.map(({ label, date }) => ({ label, date })),
      releasesDisplayMode,
      today,
    )
    const labels = new Set(filtered.map((release) => release.label))
    return releaseMarkers.filter((marker) => labels.has(marker.label))
  }, [showReleases, releasesDisplayMode, releaseMarkers, today])
  const startDateZniCount = startDateScopedItems.filter((item) => hasUserStartDate(item)).length
  const groups = groupByBoard(tagFilteredItems)
  const sidebarHead = useMemo((): SidebarHead => {
    if (groups.length === 1) {
      const group = groups[0]
      return {
        title: group.title,
        subtitle: group.areaPath,
      }
    }
    return {
      title: 'Задачи',
      subtitle: formatBoardPickerLabel(selectedBoardIds, boardOptions),
    }
  }, [groups, selectedBoardIds, boardOptions])
  const isColumnFiltering = hiddenColumnKeys.length > 0
  const isZniSearchFiltering = zniSearchQuery.trim().length > 0
  const isTagFiltering = activeSelectedTags.length > 0
  const isStartDateFiltering = useUserStartDate
  const isBoardSelectionFiltering = selectedBoardIds.length > 0
  const pendingSchedulingCount = Object.keys(schedulingOverrides).length

  const applySchedulingOverride = useCallback(
    (prev: Record<number, SchedulingOverride>, id: number, next: SchedulingOverride) => {
      const copy = { ...prev }
      copy[id] = next
      return copy
    },
    [],
  )

  const clearSchedulingOverride = useCallback(
    (prev: Record<number, SchedulingOverride>, id: number) => {
      if (!(id in prev)) return prev
      const { [id]: _removed, ...rest } = prev
      return rest
    },
    [],
  )

  const onZniSchedulingDatesChange = useCallback(
    (id: number, startDate: string, targetDate: string) => {
      setSchedulingOverrides((prev) => {
        const zni = (data?.items ?? []).find((row) => row.id === id)
        if (!zni) return prev

        const oldZni = effectiveScheduling(zni, prev[id], useUserStartDate)
        const newZni = { startDate, targetDate }
        const deltaStart = dayDiff(oldZni.startDate, newZni.startDate)
        const deltaTarget = dayDiff(oldZni.targetDate, newZni.targetDate)

        let next = { ...prev }
        if (schedulingChanged(zni, newZni, useUserStartDate)) {
          next = applySchedulingOverride(next, id, newZni)
        } else {
          next = clearSchedulingOverride(next, id)
        }

        if (deltaStart === 0 && deltaTarget === 0) return next

        for (const requirement of zni.requirements) {
          const before = effectiveRequirementScheduling(
            requirement,
            zni,
            prev[id],
            prev[requirement.id],
            useUserStartDate,
          )
          const shifted = shiftScheduling(before, deltaStart, deltaTarget)
          if (requirementSchedulingChanged(requirement, zni, shifted, useUserStartDate)) {
            next = applySchedulingOverride(next, requirement.id, shifted)
          } else {
            next = clearSchedulingOverride(next, requirement.id)
          }
        }
        return next
      })
    },
    [applySchedulingOverride, clearSchedulingOverride, data?.items, useUserStartDate],
  )

  const onRequirementSchedulingDatesChange = useCallback(
    (id: number, startDate: string, targetDate: string) => {
      setSchedulingOverrides((prev) => {
        let parent: ChangeRequest | undefined
        let requirement: Requirement | undefined
        for (const zni of data?.items ?? []) {
          const found = zni.requirements.find((row) => row.id === id)
          if (found) {
            parent = zni
            requirement = found
            break
          }
        }
        if (!parent || !requirement) return prev

        const next = { startDate, targetDate }
        if (!requirementSchedulingChanged(requirement, parent, next, useUserStartDate)) {
          return clearSchedulingOverride(prev, id)
        }
        return applySchedulingOverride(prev, id, next)
      })
    },
    [applySchedulingOverride, clearSchedulingOverride, data?.items, useUserStartDate],
  )

  const pushSchedulingToTfs = async () => {
    if (!pendingSchedulingCount || !getSessionId()) return
    setPushingScheduling(true)
    setError(null)
    try {
      const items = Object.entries(schedulingOverrides).map(([id, dates]) => ({
        id: Number(id),
        startDate: dates.startDate,
        targetDate: dates.targetDate,
      }))
      const response = await apiFetch('/api/work-items/push-scheduling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, useUserStartDate }),
      })
      if (response.status === 401) {
        clearSessionId()
        onLogout()
        return
      }
      if (!response.ok) throw new Error(await readApiError(response))
      const result = (await response.json()) as {
        successCount: number
        results: { id: number; ok: boolean; error?: string }[]
      }
      const failed = result.results.filter((row) => !row.ok)
      if (failed.length) {
        throw new Error(failed.map((row) => `#${row.id}: ${row.error ?? 'ошибка'}`).join('; '))
      }
      setSchedulingOverrides({})
      await loadRoadmap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить сроки в TFS')
    } finally {
      setPushingScheduling(false)
    }
  }

  const onTimelinePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canPanTimeline || event.button !== 0) return
    if (
      (event.target as HTMLElement).closest(
        '.col-task, a, button, .task-expand-btn, .tfs-link, .timeline-start-toggle, .sheet-resizer, .bar-schedule',
      )
    ) {
      return
    }
    dragStateRef.current = { startX: event.clientX, from, to }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onTimelinePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    const track = timelineRef.current
    if (!drag || !track) return

    const width = track.clientWidth
    if (width <= 0) return

    const baseFrom = parseLocalDate(drag.from)
    const baseTo = parseLocalDate(drag.to, true)
    const totalDays = Math.max((baseTo.getTime() - baseFrom.getTime()) / dayMs, 1)
    const daysDelta = Math.round(((drag.startX - event.clientX) / width) * totalDays)
    if (daysDelta === lastPanDaysRef.current) return
    lastPanDaysRef.current = daysDelta
    shiftTimelineByDays(daysDelta, drag.from, drag.to)
  }

  const onTimelinePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = null
    lastPanDaysRef.current = 0
    setIsPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const focusTask = (itemId: number, requirementId?: number) => {
    setSelectedItemId(itemId)
    setSelectedRequirementId(requirementId ?? null)
    const key = requirementId ? `req-${requirementId}` : `zni-${itemId}`
    rowRefs.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const bindRowRef = (rowKey: string) => (node: HTMLElement | null) => {
    if (node) rowRefs.current.set(rowKey, node)
    else rowRefs.current.delete(rowKey)
  }

  const onSidebarResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    sidebarResizeRef.current = { startX: event.clientX, startWidth: sidebarWidth }
    document.body.classList.add('is-resizing-sidebar')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const shellStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
    '--timeline-zoom': '1',
  } as React.CSSProperties

  const renderTaskCell = (row: TaskRow) => {
    if (row.type === 'error') {
      const parent = row.item
      const error = row.error
      const errHref = workItemHref(error)
      const isActive =
        selectedItemId === parent.id && selectedRequirementId === (row.requirement?.id ?? null)
      const indentClass = row.requirement ? 'task-list-row-error-req' : 'task-list-row-error-zni'
      return (
        <div
          role="button"
          tabIndex={0}
          className={`sync-row sync-row-err task-list-row task-list-row-error ${indentClass} ${isActive ? 'active' : ''}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a, .selectable-text, .tfs-link')) return
            focusTask(parent.id, row.requirement?.id)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              focusTask(parent.id, row.requirement?.id)
            }
          }}
        >
          <div className="task-list-row-top">
            <span className="task-list-id selectable-text">↳↳ #{error.id}</span>
            <div className="task-list-row-actions">{errHref ? <TfsLink href={errHref} /> : null}</div>
          </div>
          <div className="task-kind-row">
            <span className="task-kind-badge task-kind-err">Ошибка</span>
            <div className={`task-column-pill ${columnColorClass(errorColumnLabel(error))}`}>
              <span className="task-column-pill-label">Статус</span>
              <span className="task-column-pill-value">{errorColumnLabel(error)}</span>
            </div>
          </div>
          <p className="task-list-title-full selectable-text" onClick={stopRowActivation} onPointerDown={stopRowActivation}>
            {error.title || `Ошибка #${error.id}`}
          </p>
        </div>
      )
    }

    if (row.type === 'zni') {
      const zni = row.item
      const tfsHref = workItemHref(zni)
      const childRequirements = visibleRequirements(zni.requirements, hiddenColumnKeys)
      const reqCount = childRequirements.length
      const isExpanded = expandedZniIds.has(zni.id)
      const isActive = selectedItemId === zni.id && selectedRequirementId === null
      return (
        <div
          role="button"
          tabIndex={0}
          className={`sync-row sync-row-zni task-list-row task-list-row-zni ${isActive ? 'active' : ''} ${isExpanded ? 'is-expanded' : ''}`}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a, .selectable-text, .tfs-link, .task-expand-btn')) return
            focusTask(zni.id)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              focusTask(zni.id)
            }
          }}
        >
          <div className="task-list-row-top">
            <div className="task-list-row-leading">
              {reqCount > 0 ? (
                <button
                  type="button"
                  className={`task-expand-btn ${isExpanded ? 'is-open' : ''}`}
                  aria-expanded={isExpanded}
                  title={isExpanded ? 'Скрыть требования' : `Показать ${reqCount} требований`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleZniExpanded(zni.id)
                    focusTask(zni.id)
                  }}
                >
                  <span className="task-expand-icon" aria-hidden>
                    {isExpanded ? '−' : '+'}
                  </span>
                  <span className="task-expand-count">{reqCount}</span>
                </button>
              ) : (
                <span className="task-expand-placeholder" aria-hidden />
              )}
              <span className="task-list-id selectable-text">#{zni.id}</span>
            </div>
            <div className="task-list-row-actions">
              {tfsHref ? <TfsLink href={tfsHref} /> : null}
            </div>
          </div>
          <div className="task-kind-row">
            <span className="task-kind-badge task-kind-zni">Запрос на изменение</span>
            <div className={`task-column-pill ${columnColorClass(zniColumnLabel(zni))}`}>
              <span className="task-column-pill-label">Колонка</span>
              <span className="task-column-pill-value">{zniColumnLabel(zni)}</span>
            </div>
          </div>
          <p className="task-list-title-full selectable-text" onClick={stopRowActivation} onPointerDown={stopRowActivation}>
            {zni.title}
          </p>
          <em className="task-list-dates selectable-text" onClick={stopRowActivation} onPointerDown={stopRowActivation}>
            старт{' '}
            {formatDate(
              effectiveScheduling(zni, schedulingOverrides[zni.id], useUserStartDate).startDate,
            )}
            {useUserStartDate && zni.userStartDate ? ' (Start Date)' : ''} · план{' '}
            {formatDate(effectiveScheduling(zni, schedulingOverrides[zni.id], useUserStartDate).targetDate)}
            {schedulingOverrides[zni.id] ? ' · изменено' : ''}
            {reqCount ? ` · ${reqCount} треб.` : ''}
          </em>
        </div>
      )
    }

    const requirement = row.requirement
    const parent = row.item
    const reqHref = workItemHref(requirement)
    const isActive = selectedItemId === parent.id && selectedRequirementId === requirement.id
    return (
      <div
        role="button"
        tabIndex={0}
        className={`sync-row sync-row-req task-list-row task-list-row-req ${isActive ? 'active' : ''}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a, .selectable-text, .tfs-link')) return
          focusTask(parent.id, requirement.id)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            focusTask(parent.id, requirement.id)
          }
        }}
      >
        <div className="task-list-row-top">
          <span className="task-list-id selectable-text">↳ #{requirement.id}</span>
          <div className="task-list-row-actions">{reqHref ? <TfsLink href={reqHref} /> : null}</div>
        </div>
        <div className="task-kind-row">
          <span className="task-kind-badge task-kind-req">Требование</span>
          <div className={`task-column-pill ${columnColorClass(requirementColumnLabel(requirement))}`}>
            <span className="task-column-pill-label">Колонка</span>
            <span className="task-column-pill-value">{requirementColumnLabel(requirement)}</span>
          </div>
        </div>
        <p className="task-list-title-full selectable-text" onClick={stopRowActivation} onPointerDown={stopRowActivation}>
          {requirement.title}
        </p>
        <em className="task-list-dates selectable-text" onClick={stopRowActivation} onPointerDown={stopRowActivation}>
          {requirementDatesLabel(requirement, parent, schedulingOverrides, useUserStartDate)}
        </em>
      </div>
    )
  }

  const renderTimelineCell = (row: TaskRow) => {
    if (row.type === 'error') {
      const parent = row.item
      const error = row.error
      const errHref = workItemHref(error)
      const barLayout = errorTimelineBarLayout(
        error,
        parent,
        fromDate,
        toDate,
        useUserStartDate,
        requirementSortAxes,
        schedulingOverrides,
        errorsDisplayMode,
      )
      return (
        <article className="sync-row sync-row-err roadmap-row roadmap-row-err">
          <div className="timeline-zoom-track">
            <div className="row-track">
              <div
                className="zni-span-ghost"
                style={{ left: `${barLayout.span.left}%`, width: `${barLayout.span.width}%` }}
                aria-hidden
                title={`Срок ЗНИ #${parent.id}`}
              />
              <div
                className={`bar bar-error ${barLayout.byStatus ? 'bar-error-by-status' : ''} ${columnBarClass(barLayout.label)}`}
                style={{
                  left: `${barLayout.left}%`,
                  width: `${barLayout.width}%`,
                  minWidth: barLayout.byStatus ? '88px' : '100px',
                }}
                title={`${barLayout.label}\n${error.title}`}
              >
                <div className="bar-text">
                  <span className="bar-kind-badge bar-kind-err">Ошибка</span>
                  <span className="bar-status">{barLayout.label}</span>
                  <span className="bar-label selectable-text" onClick={stopRowActivation} onPointerDown={stopRowActivation}>
                    <b>↳ #{error.id}</b> {error.title || 'Без названия'}
                  </span>
                </div>
                {errHref ? <TfsLink href={errHref} className="bar-tfs-link" /> : null}
              </div>
            </div>
          </div>
        </article>
      )
    }

    if (row.type === 'zni') {
      const zni = row.item
      const isActive = selectedItemId === zni.id && selectedRequirementId === null
      const override = schedulingOverrides[zni.id]
      const effective = effectiveScheduling(zni, override, useUserStartDate)
      const isPending = Boolean(override && schedulingChanged(zni, override, useUserStartDate))
      const zniHasTags = Boolean(zni.tags?.length)
      const zniBarWidth = progressWidth(effective.startDate, effective.targetDate, fromDate, toDate)
      const zniBarIsNarrow = zniHasTags && zniBarWidth < 22
      return (
        <article
          className={`sync-row sync-row-zni roadmap-row roadmap-row-zni ${isActive ? 'active' : ''} ${zniHasTags ? 'roadmap-row-has-tags' : ''} ${zniBarIsNarrow ? 'roadmap-row-has-tags-narrow' : ''} ${isPending ? 'roadmap-row-has-pending' : ''}`}
        >
          <div className="timeline-zoom-track">
            <ZniTimelineBar
              item={zni}
              fromDate={fromDate}
              toDate={toDate}
              useUserStartDate={useUserStartDate}
              override={override}
              isPending={isPending}
              statusClassName={columnBarClass(zniColumnLabel(zni))}
              columnLabel={zniColumnLabel(zni)}
              zoneTitle={zoneTitle(zni)}
              formatDate={formatDate}
              onDatesChange={onZniSchedulingDatesChange}
              onFocus={() => focusTask(zni.id)}
              renderTfsLink={(href) => (href ? <TfsLink href={href} className="bar-tfs-link" /> : null)}
              stopRowActivation={stopRowActivation}
            />
          </div>
        </article>
      )
    }

    const requirement = row.requirement
    const parent = row.item
    const reqHref = workItemHref(requirement)
    const reqOverride = schedulingOverrides[requirement.id]
    const reqEffective = effectiveRequirementScheduling(
      requirement,
      parent,
      schedulingOverrides[parent.id],
      reqOverride,
      useUserStartDate,
    )
    const reqPending = Boolean(
      reqOverride && requirementSchedulingChanged(requirement, parent, reqOverride, useUserStartDate),
    )
    const barLayout = requirementTimelineBarLayout(
      requirement,
      parent,
      fromDate,
      toDate,
      useUserStartDate,
      requirementSortAxes,
      schedulingOverrides,
    )
    const isActive = selectedItemId === parent.id && selectedRequirementId === requirement.id
    const columnLabel = requirementColumnLabel(requirement)
    const datesLabel = requirementDatesLabel(requirement, parent, schedulingOverrides, useUserStartDate)
    const barTitle =
      barLayout.mode === 'combined'
        ? `${columnLabel}${columnLabel !== requirement.state ? ` (статус: ${requirement.state})` : ''} · порядок по колонке, колбаска по датам\n${requirement.title}\n${datesLabel}`
        : barLayout.mode === 'status'
          ? `${columnLabel} · по колонке в сроке ЗНИ (New слева → Closed справа)\n${requirement.title}\n${datesLabel}`
          : `${columnLabel} · колбаска по Start Date и плановой дате\n${requirement.title}\n${datesLabel}`
    const useStairTrack = barLayout.mode === 'status'
    const useCompactBar = barLayout.mode === 'status'
    const reqDraggable = requirementSortAxes.byDate

    return (
      <article
        className={`sync-row sync-row-req roadmap-row roadmap-row-req ${isActive ? 'active' : ''} ${reqPending ? 'roadmap-row-has-pending' : ''}`}
      >
        <div className="timeline-zoom-track">
          {reqDraggable ? (
            <ScheduleTimelineBar
              fromDate={fromDate}
              toDate={toDate}
              committed={reqEffective}
              isPending={reqPending}
              draggable
              barClassName={`bar bar-req bar-schedule ${columnBarClass(requirementColumnLabel(requirement))}`}
              title={`${barTitle}${reqPending ? '\nИзменено локально — нажмите «Обновить статусы в TFS»' : ''}\nКрай — изменить срок · центр — сдвинуть`}
              onDatesChange={(startDate, targetDate) =>
                onRequirementSchedulingDatesChange(requirement.id, startDate, targetDate)
              }
              onFocus={() => focusTask(parent.id, requirement.id)}
              footer={reqHref ? <TfsLink href={reqHref} className="bar-tfs-link" /> : null}
            >
              <div className="bar-text">
                <span className="bar-kind-badge bar-kind-req">Требование</span>
                <span className="bar-status">{requirementColumnLabel(requirement)}</span>
                <span
                  className="bar-label selectable-text"
                  onClick={stopRowActivation}
                  onPointerDown={stopRowActivation}
                >
                  <b>↳ #{requirement.id}</b> {requirement.title}
                </span>
              </div>
            </ScheduleTimelineBar>
          ) : (
            <div className={`row-track ${useStairTrack ? 'row-track-req-stair' : ''}`}>
              {barLayout.span ? (
                <div
                  className="zni-span-ghost"
                  style={{ left: `${barLayout.span.left}%`, width: `${barLayout.span.width}%` }}
                  aria-hidden
                  title={`Срок ЗНИ #${parent.id}`}
                />
              ) : null}
              <div
                className={`bar bar-req ${useCompactBar ? 'bar-req-by-status' : ''} ${columnBarClass(requirementColumnLabel(requirement))}`}
                style={{
                  left: `${barLayout.left}%`,
                  width: `${barLayout.width}%`,
                  minWidth: useCompactBar ? '120px' : '156px',
                }}
                title={barTitle}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('.selectable-text, .tfs-link')) return
                  focusTask(parent.id, requirement.id)
                }}
              >
                <div className="bar-text">
                  <span className="bar-kind-badge bar-kind-req">Требование</span>
                  <span className="bar-status">{requirementColumnLabel(requirement)}</span>
                  <span
                    className="bar-label selectable-text"
                    onClick={stopRowActivation}
                    onPointerDown={stopRowActivation}
                  >
                    <b>↳ #{requirement.id}</b> {requirement.title}
                  </span>
                </div>
                {reqHref ? <TfsLink href={reqHref} className="bar-tfs-link" /> : null}
              </div>
            </div>
          )}
        </div>
      </article>
    )
  }

  const timelineToolbar = (
    <div className="timeline-toolbar-row">
      <div className="timeline-toolbar-task-spacer" aria-hidden />
      <div className="timeline-toolbar-main">
        <span className="timeline-period">{formatDate(fromDate)} — {formatDate(toDate)}</span>
        <div className="timeline-head-actions">
          <div className="timeline-head-primary-toggles">
            <ReleasesDisplayToggle
              showReleases={showReleases}
              displayMode={releasesDisplayMode}
              releaseCount={releaseMarkers.length}
              onChange={(choice) => {
                if (choice === 'hidden') {
                  setShowReleases(false)
                  return
                }
                setShowReleases(true)
                setReleasesDisplayMode(choice)
              }}
            />
            <ErrorsDisplayToggle
              showErrors={showErrors}
              displayMode={errorsDisplayMode}
              onChange={(choice) => {
                if (choice === 'hidden') {
                  setShowErrors(false)
                  return
                }
                setShowErrors(true)
                setErrorsDisplayMode(choice)
              }}
            />
          </div>
          <button
            type="button"
            className={`timeline-head-toggle ${requirementSortAxes.byStatus ? 'is-on' : ''}`}
            aria-pressed={requirementSortAxes.byStatus}
            title="По статусу: порядок строк (New → Closed) и смещение маркера в сроке ЗНИ. С «По дате» — ещё и колбаска от Start Date до плана."
            onClick={() => setRequirementSortAxes((prev) => toggleRequirementSortAxis(prev, 'byStatus'))}
          >
            По статусу
          </button>
          <button
            type="button"
            className={`timeline-head-toggle ${requirementSortAxes.byDate ? 'is-on' : ''}`}
            aria-pressed={requirementSortAxes.byDate}
            title="По дате: колбаска на шкале от старта до плана; перетаскивание и изменение сроков краями. Порядок строк по дате старта."
            onClick={() => setRequirementSortAxes((prev) => toggleRequirementSortAxis(prev, 'byDate'))}
          >
            По дате
          </button>
          <button
            type="button"
            className={`timeline-head-toggle ${useUserStartDate ? 'is-on' : ''}`}
            aria-pressed={useUserStartDate}
            title="Показать только ЗНИ с заполненным Start Date в TFS (Microsoft.VSTS.Scheduling.StartDate). Старт колбаски — по этому полю."
            onClick={() => setUseUserStartDate((value) => !value)}
          >
            {useUserStartDate ? 'Только Start Date' : 'Start Date: выкл'}
          </button>
          <span className="timeline-stats">
            {loading
              ? 'Загрузка…'
              : isStartDateFiltering
                ? `${tagFilteredItems.length} / ${startDateZniCount} ЗНИ (Start Date)`
                : isZniSearchFiltering
                  ? `${tagFilteredItems.length} / ${searchScopedItems.length} ЗНИ (поиск)`
                  : isTagFiltering
                    ? `${tagFilteredItems.length} / ${tagScopedItems.length} ЗНИ (теги)`
                    : isBoardSelectionFiltering
                      ? `${tagScopedItems.length} / ${startDateScopedItems.length} ЗНИ (доски)`
                      : isColumnFiltering
                        ? `${tagFilteredItems.length} / ${searchScopedItems.length} ЗНИ (колонки)`
                        : `${tagFilteredItems.length} ЗНИ`}
            {data?.generatedAt ? ` · обновлено ${formatDate(data.generatedAt)}` : ''}
          </span>
        </div>
      </div>
    </div>
  )

  const timelineHead = (
    <>
      <div ref={timelineRef} className="timeline-ruler">
        <div className="timeline-months">
          {monthRulerTicks.map((tick) => (
            <span key={`${tick.label}-${tick.left}`} className="timeline-month" style={{ left: `${tick.left}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
        <div className="timeline-days">
          {dayRulerTicks.map((tick) => (
            <span
              key={`${tick.label}-${tick.left}`}
              className={`timeline-day ${tick.isFirstOfMonth ? 'is-month-start' : ''}`}
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <main className="app-shell" style={shellStyle}>
      <header className="app-header">
        <div className="app-header-row">
          <h1 className="app-title">TFS Roadmap</h1>
          <div className="filter-bar">
            <PeriodPicker
              scale={scale}
              selectedYear={selectedYear}
              selectedQuarter={selectedQuarter}
              selectedMonth={selectedMonth}
              from={from}
              to={to}
              yearOptions={yearOptions()}
              onScaleChange={handlePeriodScaleChange}
              onYearChange={handlePeriodYearChange}
              onQuarterChange={handlePeriodQuarterChange}
              onMonthChange={handlePeriodMonthChange}
              onRangeApply={(nextFrom, nextTo) => {
                setFrom(nextFrom)
                setTo(nextTo)
                setScale('custom')
              }}
            />
            <span className="filter-bar-sep" />
            <div className="board-picker">
              <BoardMultiPicker
                boards={boardOptions}
                favoriteIds={favoriteBoardIds}
                pinnedId={pinnedBoardId}
                selectedIds={selectedBoardIds}
                onChange={setSelectedBoardIds}
              />
              <button
                type="button"
                className={`board-action-btn board-action-btn-fav ${isBoardFavorite ? 'is-on' : ''}`}
                title={
                  canPinBoard
                    ? isBoardFavorite
                      ? 'Убрать из избранного'
                      : 'В избранное'
                    : 'Избранное доступно при выборе одной доски'
                }
                disabled={!canPinBoard}
                onClick={toggleFavoriteBoard}
              >
                ★
              </button>
              <button
                type="button"
                className={`board-action-btn board-action-btn-pin ${isBoardPinned ? 'is-on' : ''}`}
                title={
                  canPinBoard
                    ? isBoardPinned
                      ? 'Открепить доску'
                      : 'Закрепить доску'
                    : 'Закрепление доступно при выборе одной доски'
                }
                disabled={!canPinBoard}
                onClick={togglePinBoard}
              >
                📌
              </button>
              <button
                type="button"
                className="board-action-btn"
                title="Обновить список досок из TFS"
                onClick={() => void loadBoards(true)}
              >
                ↻
              </button>
            </div>
            <span className="filter-bar-sep" />
            <div className="filter-bar-search">
              <input
                type="search"
                className="filter-bar-input filter-bar-zni-search"
                placeholder="Поиск ЗНИ: #id, название, релиз…"
                value={zniSearchQuery}
                onChange={(event) => setZniSearchQuery(event.target.value)}
                aria-label="Поиск по ЗНИ"
              />
              {zniSearchQuery.trim() ? (
                <button
                  type="button"
                  className="board-action-btn board-search-clear"
                  title="Очистить поиск"
                  aria-label="Очистить поиск"
                  onClick={() => setZniSearchQuery('')}
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className={`btn-push-tfs ${pendingSchedulingCount ? 'has-pending' : ''}`}
              disabled={!pendingSchedulingCount || pushingScheduling || syncing}
              title={
                pendingSchedulingCount
                  ? `Отправить изменённые сроки (${pendingSchedulingCount}) в TFS`
                  : 'Перетащите колбаску на таймлайне, чтобы изменить сроки'
              }
              onClick={() => void pushSchedulingToTfs()}
            >
              {pushingScheduling
                ? '…'
                : pendingSchedulingCount
                  ? `Обновить статусы в TFS (${pendingSchedulingCount})`
                  : 'Обновить статусы в TFS'}
            </button>
            <button
              className="btn-refresh"
              type="button"
              onClick={() => void runSync('period')}
              disabled={syncing}
              title="Подтянуть ЗНИ только за выбранный период (С — По)"
            >
              {syncing ? '…' : 'Обновить'}
            </button>
            <button
              className="btn-sync"
              type="button"
              onClick={() => void runSync('full')}
              disabled={syncing}
              title={syncRun?.message ?? 'Полная выгрузка всех ЗНИ из TFS (может занять долго)'}
            >
              {syncing ? syncRun?.message ?? 'Выгрузка…' : 'Выгрузить'}
            </button>
            <button type="button" className="btn-logout" onClick={() => void logout()}>
              Выйти из TFS
            </button>
          </div>
        </div>
        <div className="status-strip column-filter-strip">
          {useMergedColumnFilters ? (
            <div className="column-filter-board">
              <span className="filter-strip-label">Колонки</span>
              <div className="column-filter-board-chips">
                {mergedColumnFilters.map((entry) => {
                  const key = columnNameFilterKey(entry.column)
                  const active = isColumnKeyVisible(key, hiddenColumnKeys)
                  const boardsHint =
                    entry.boardNames.length > 1 ? entry.boardNames.join(', ') : entry.boardNames[0] ?? ''
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`status-filter ${columnColorClass(entry.column)} ${active ? 'is-on' : 'is-off'}`}
                      title={
                        active
                          ? `Скрыть «${entry.column}»${boardsHint ? ` · доски: ${boardsHint}` : ''}`
                          : `Показать «${entry.column}»${boardsHint ? ` · доски: ${boardsHint}` : ''}`
                      }
                      aria-pressed={active}
                      onClick={() => toggleHiddenColumn(entry.column)}
                    >
                      {entry.column}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            columnFiltersByBoard.map((group) => (
              <div key={group.boardId ?? '_none'} className="column-filter-board">
                <span className="filter-strip-label">Колонки</span>
                <div className="column-filter-board-chips">
                  {group.columns.map((column) => {
                    const key = columnNameFilterKey(column)
                    const active = isColumnKeyVisible(key, hiddenColumnKeys)
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`status-filter ${columnColorClass(column)} ${active ? 'is-on' : 'is-off'}`}
                        title={active ? `Скрыть колонку «${column}»` : `Показать колонку «${column}»`}
                        aria-pressed={active}
                        onClick={() => toggleHiddenColumn(column)}
                      >
                        {column}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
          {isColumnFiltering && (
            <button type="button" className="status-filter-reset" onClick={() => setHiddenColumnKeys([])}>
              Показать все колонки
            </button>
          )}
          <span className="filter-strip-sep" aria-hidden />
          <span className="filter-strip-label">Теги</span>
          <TagFilterStrip
            tags={availableTags}
            selectedTags={activeSelectedTags}
            onToggle={toggleSelectedTag}
            onClear={() => setSelectedTags([])}
          />
          {syncRun && (
            <span className={`sync-hint ${syncRun.status === 'failed' ? 'sync-hint-error' : ''}`}>
              {syncRun.status === 'success'
                ? `Готово: ${syncRun.changeRequestsCount ?? 0} ЗНИ`
                : syncRun.message ?? `Статус: ${syncRun.status}`}
            </span>
          )}
        </div>
      </header>

      <section
        className={`roadmap-panel-unified ${canPanTimeline ? 'timeline-pannable' : ''} ${isPanning ? 'timeline-panning' : ''}`}
        title={canPanTimeline ? 'Зажмите левую кнопку мыши на диаграмме и тяните влево/вправо' : undefined}
        onPointerDown={onTimelinePointerDown}
        onPointerMove={onTimelinePointerMove}
        onPointerUp={onTimelinePointerUp}
        onPointerCancel={onTimelinePointerUp}
      >
        {error && <div className="error">{error}</div>}
        {timelineToolbar}
        <RoadmapGrid
          groups={groups}
          hiddenStates={hiddenColumnKeys}
          expandedZniIds={expandedZniIds}
          taskRowKey={taskRowKey}
          renderTaskCell={renderTaskCell}
          renderTimelineCell={renderTimelineCell}
          loading={loading}
          visibleCount={tagFilteredItems.length}
          buildTaskRows={buildTaskRowsForGrid}
          sidebarHead={sidebarHead}
          timelineHead={timelineHead}
          emptyState={
            <div className="task-list-empty">
              <strong>
                {isZniSearchFiltering
                  ? 'Нет ЗНИ по запросу'
                  : isTagFiltering
                    ? 'Нет ЗНИ с выбранными тегами'
                    : isBoardSelectionFiltering
                      ? 'Нет ЗНИ для выбранных досок'
                      : isStartDateFiltering
                        ? 'Нет ЗНИ с Start Date'
                        : isColumnFiltering
                          ? 'Нет ЗНИ с видимыми колонками'
                          : 'Нет ЗНИ за период'}
              </strong>
              <p>
                {isZniSearchFiltering
                  ? 'Измените запрос в поле поиска или очистите его кнопкой ×.'
                  : isTagFiltering
                    ? 'Включите другие теги в «Теги» или нажмите «Сбросить фильтр».'
                    : isBoardSelectionFiltering
                      ? 'Откройте выбор досок и отметьте нужные, либо нажмите «Все доски».'
                      : isStartDateFiltering
                        ? 'У видимых ЗНИ в TFS не заполнено поле Start Date, или отключите фильтр «Только Start Date».'
                        : isColumnFiltering
                          ? 'Включите колонки в шапке или нажмите «Показать все колонки».'
                          : 'Нажмите «Выгрузить» или «Обновить» для загрузки из TFS.'}
              </p>
            </div>
          }
          onResizerPointerDown={onSidebarResizeStart}
          bindRowRef={bindRowRef}
          isTodayVisible={isTodayVisible}
          todayLeft={todayLeft}
          releaseMarkers={visibleReleaseMarkers}
        />
      </section>
    </main>
  )
}

export default RoadmapScreen

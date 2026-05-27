import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  moveVisualByPointerDelta,
  pointerTimelinePercent,
  resizeEndVisual,
  resizeStartVisual,
  schedulingToVisual,
  visualToScheduling,
  type SchedulingOverride,
  type TimelineBarVisual,
} from './schedulingUtils'

type DragMode = 'move' | 'resize-start' | 'resize-end'

type DragSession = {
  mode: DragMode
  pointerId: number
  pointerStartX: number
  originVisual: TimelineBarVisual
}

const EDGE_HIT_MAX_PX = 14
const EDGE_HIT_MIN_RATIO = 0.1

function edgeHitPx(barWidth: number) {
  return Math.min(EDGE_HIT_MAX_PX, Math.max(8, barWidth * EDGE_HIT_MIN_RATIO))
}

function resolveDragMode(event: React.PointerEvent, barEl: HTMLElement): DragMode | null {
  if (
    (event.target as HTMLElement).closest(
      '.selectable-text, .tfs-link, .bar-tag-chip, .bar-tag-more, button, a',
    )
  ) {
    return null
  }
  const rect = barEl.getBoundingClientRect()
  if (rect.width <= 0) return null
  const offsetX = event.clientX - rect.left
  const edge = edgeHitPx(rect.width)
  if (offsetX <= edge) return 'resize-start'
  if (offsetX >= rect.width - edge) return 'resize-end'
  return 'move'
}

function dragModeCursor(mode: DragMode | null) {
  if (mode === 'resize-start' || mode === 'resize-end') return 'ew-resize'
  if (mode === 'move') return 'grab'
  return ''
}

type ScheduleTimelineBarProps = {
  fromDate: Date
  toDate: Date
  committed: SchedulingOverride
  isPending: boolean
  draggable: boolean
  barClassName: string
  title: string
  onDatesChange: (startDate: string, targetDate: string) => void
  onFocus: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function ScheduleTimelineBar({
  fromDate,
  toDate,
  committed,
  isPending,
  draggable,
  barClassName,
  title,
  onDatesChange,
  onFocus,
  children,
  footer,
}: ScheduleTimelineBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<DragSession | null>(null)
  const dragVisualRef = useRef<TimelineBarVisual | null>(null)
  const movedRef = useRef(false)
  const onDatesChangeRef = useRef(onDatesChange)
  onDatesChangeRef.current = onDatesChange
  const fromDateRef = useRef(fromDate)
  fromDateRef.current = fromDate
  const toDateRef = useRef(toDate)
  toDateRef.current = toDate

  const [isDragging, setIsDragging] = useState(false)
  const [dragVisual, setDragVisual] = useState<TimelineBarVisual | null>(null)
  const [hoverMode, setHoverMode] = useState<DragMode | null>(null)
  const [isNarrow, setIsNarrow] = useState(false)

  const baseVisual = schedulingToVisual(committed.startDate, committed.targetDate, fromDate, toDate)
  const displayVisual = dragVisual ?? baseVisual

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const update = () => setIsNarrow(bar.clientWidth < 156)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [displayVisual.leftPct, displayVisual.widthPct])

  const beginDrag = (event: React.PointerEvent, mode: DragMode) => {
    if (!draggable || event.button !== 0) return
    const track = trackRef.current
    if (!track) return
    event.stopPropagation()
    event.preventDefault()
    movedRef.current = false
    const originVisual = schedulingToVisual(committed.startDate, committed.targetDate, fromDate, toDate)
    sessionRef.current = {
      mode,
      pointerId: event.pointerId,
      pointerStartX: event.clientX,
      originVisual,
    }
    dragVisualRef.current = originVisual
    setDragVisual(originVisual)
    setIsDragging(true)
    setHoverMode(mode)
    document.body.classList.add('zni-schedule-drag')
    document.body.dataset.zniDragMode = mode
    onFocus()
  }

  const onBarPointerDown = (event: React.PointerEvent) => {
    if (!draggable) return
    const bar = barRef.current
    if (!bar) return
    const mode = resolveDragMode(event, bar)
    if (!mode) return
    beginDrag(event, mode)
  }

  const onBarPointerMove = (event: React.PointerEvent) => {
    if (!draggable || isDragging) return
    const bar = barRef.current
    if (!bar) return
    setHoverMode(resolveDragMode(event, bar))
  }

  const onBarPointerLeave = () => {
    if (!isDragging) setHoverMode(null)
  }

  useEffect(() => {
    if (!isDragging) return

    const onPointerMove = (event: PointerEvent) => {
      const session = sessionRef.current
      const track = trackRef.current
      if (!session || !track || event.pointerId !== session.pointerId) return

      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return

      if (Math.abs(event.clientX - session.pointerStartX) > 2) {
        movedRef.current = true
      }

      let nextVisual: TimelineBarVisual
      if (session.mode === 'move') {
        nextVisual = moveVisualByPointerDelta(
          session.originVisual,
          session.pointerStartX,
          event.clientX,
          rect,
        )
      } else if (session.mode === 'resize-start') {
        nextVisual = resizeStartVisual(pointerTimelinePercent(event.clientX, rect), session.originVisual)
      } else {
        nextVisual = resizeEndVisual(pointerTimelinePercent(event.clientX, rect), session.originVisual)
      }
      dragVisualRef.current = nextVisual
      setDragVisual(nextVisual)
    }

    const finishDrag = (event: PointerEvent) => {
      const session = sessionRef.current
      if (!session || event.pointerId !== session.pointerId) return

      sessionRef.current = null
      setIsDragging(false)
      setHoverMode(null)
      document.body.classList.remove('zni-schedule-drag')
      delete document.body.dataset.zniDragMode

      const finalVisual = dragVisualRef.current ?? session.originVisual
      dragVisualRef.current = null
      setDragVisual(null)
      const next = visualToScheduling(finalVisual, fromDateRef.current, toDateRef.current)
      if (movedRef.current) {
        onDatesChangeRef.current(next.startDate, next.targetDate)
      }
      movedRef.current = false
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', finishDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', finishDrag)
      document.body.classList.remove('zni-schedule-drag')
      delete document.body.dataset.zniDragMode
    }
  }, [isDragging])

  const barCursor = !draggable
    ? undefined
    : isDragging
      ? hoverMode === 'move'
        ? 'grabbing'
        : 'ew-resize'
      : dragModeCursor(hoverMode)

  return (
    <div className={`row-track ${isDragging ? 'row-track-schedule-drag' : ''}`} ref={trackRef}>
      <div
        ref={barRef}
        className={`${barClassName} ${isPending ? 'bar-has-pending' : ''} ${isDragging ? 'bar-is-dragging' : ''} ${isNarrow ? 'bar-is-narrow' : ''} ${hoverMode === 'resize-start' ? 'bar-edge-start' : ''} ${hoverMode === 'resize-end' ? 'bar-edge-end' : ''}`}
        style={{
          left: `${displayVisual.leftPct}%`,
          width: `${displayVisual.widthPct}%`,
          cursor: barCursor,
        }}
        title={title}
        onPointerDown={onBarPointerDown}
        onPointerMove={onBarPointerMove}
        onPointerLeave={onBarPointerLeave}
        onClick={(event) => {
          if (movedRef.current) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if ((event.target as HTMLElement).closest('.selectable-text, .tfs-link')) return
          onFocus()
        }}
      >
        {children}
        {footer}
      </div>
    </div>
  )
}

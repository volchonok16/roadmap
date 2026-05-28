import type { CSSProperties, ReactNode } from 'react'
import type { ReleaseTimelineMarker } from './releaseUtils'
import type { ChangeRequest, LinkedError, Requirement } from './roadmapTypes'

export type { ChangeRequest, LinkedError, Requirement } from './roadmapTypes'

export type TaskRow =
  | { type: 'zni'; item: ChangeRequest }
  | { type: 'requirement'; item: ChangeRequest; requirement: Requirement }
  | { type: 'error'; item: ChangeRequest; error: LinkedError; requirement?: Requirement }

export type BoardGroup = {
  key: string
  title: string
  areaPath: string | null
  items: ChangeRequest[]
}

export type SidebarHead = {
  title: string
  subtitle: string | null
}

type RoadmapGridProps = {
  groups: BoardGroup[]
  hiddenStates: string[]
  expandedZniIds: Set<number>
  buildTaskRows: (item: ChangeRequest, hidden: string[], expanded: Set<number>) => TaskRow[]
  taskRowKey: (row: TaskRow) => string
  renderTaskCell: (row: TaskRow) => ReactNode
  renderTimelineCell: (row: TaskRow) => ReactNode
  loading: boolean
  visibleCount: number
  sidebarHead: SidebarHead
  timelineHead: ReactNode
  emptyState: ReactNode
  onResizerPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  bindRowRef: (rowKey: string) => (node: HTMLElement | null) => void
  isTodayVisible: boolean
  todayLeft: number
  releaseMarkers: ReleaseTimelineMarker[]
  selectedStartLeft: number | null
  selectedTargetLeft: number | null
  showGroupHeaders: boolean
}

export default function RoadmapGrid({
  groups,
  hiddenStates,
  expandedZniIds,
  buildTaskRows,
  taskRowKey,
  renderTaskCell,
  renderTimelineCell,
  loading,
  visibleCount,
  sidebarHead,
  timelineHead,
  emptyState,
  onResizerPointerDown,
  bindRowRef,
  isTodayVisible,
  todayLeft,
  releaseMarkers,
  selectedStartLeft,
  selectedTargetLeft,
  showGroupHeaders,
}: RoadmapGridProps) {
  const hasSelectionMarkers = selectedStartLeft !== null || selectedTargetLeft !== null
  const hasTimelineMarkers = isTodayVisible || releaseMarkers.length > 0 || hasSelectionMarkers
  return (
    <div className="roadmap-workspace">
      <div className="sync-sheet">
        {hasTimelineMarkers && (
          <div className="timeline-today-layer" aria-hidden>
            {releaseMarkers.map((release) => (
              <div
                key={release.label}
                className="release-line-sheet"
                style={{ '--release-left': `${release.left}%` } as CSSProperties}
                title={`Релиз ${release.label}`}
              />
            ))}
            {isTodayVisible && (
              <div className="today-line-sheet" style={{ '--today-left': `${todayLeft}%` } as CSSProperties} />
            )}
            {selectedStartLeft !== null && (
              <div
                className="selected-date-line-sheet selected-date-line-start"
                style={{ '--selected-left': `${selectedStartLeft}%` } as CSSProperties}
                title="Дата старта выбранного ЗНИ"
              />
            )}
            {selectedTargetLeft !== null && (
              <div
                className="selected-date-line-sheet selected-date-line-target"
                style={{ '--selected-left': `${selectedTargetLeft}%` } as CSSProperties}
                title="Плановая дата выбранного ЗНИ"
              />
            )}
          </div>
        )}
        <div
          className="sheet-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Ширина списка задач"
          onPointerDown={onResizerPointerDown}
        />
        <div className="sync-head-row">
          <div className="col-task sheet-toolbar">
            <div className="sheet-toolbar-zone">
              <h2>{sidebarHead.title}</h2>
              {sidebarHead.subtitle ? <p className="task-sidebar-sub">{sidebarHead.subtitle}</p> : null}
            </div>
            <span className="task-sidebar-count">{loading ? '…' : `${visibleCount} ЗНИ`}</span>
          </div>
          <div className="col-timeline sheet-timeline-head timeline-head">{timelineHead}</div>
        </div>

        {!loading && visibleCount === 0 && <div className="sync-empty-row">{emptyState}</div>}

        {groups.map((group) => (
          <section key={group.key} className="sync-group-section">
            {showGroupHeaders && (
              <div className="sync-data-row sync-group-row sync-group-row-inline">
                <div className="col-task">
                  <div className="sync-group-head sync-group-head-inline">
                    <div className="sync-group-head-title">{group.title}</div>
                    {group.areaPath ? <div className="sync-group-head-path">{group.areaPath}</div> : null}
                  </div>
                </div>
                <div className="col-timeline sync-group-head-spacer" aria-hidden />
              </div>
            )}
            {group.items.map((item) =>
              buildTaskRows(item, hiddenStates, expandedZniIds).map((row) => (
                <div key={taskRowKey(row)} className="sync-data-row" ref={bindRowRef(taskRowKey(row))}>
                  <div className="col-task">{renderTaskCell(row)}</div>
                  <div className="col-timeline">{renderTimelineCell(row)}</div>
                </div>
              )),
            )}
          </section>
        ))}
        <div className="sync-sheet-footer" aria-hidden />
      </div>
    </div>
  )
}

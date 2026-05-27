export type Requirement = {
  id: number
  title: string
  state: string
  /** Колонка Kanban-доски TFS (System.BoardColumn), если отличается от workflow State. */
  column?: string | null
  assignee?: string | null
  assigneeAvatarUrl?: string | null
  tfsUrl?: string | null
  startDate?: string | null
  targetDate?: string | null
}

export type ChangeRequest = {
  id: number
  title: string
  state: string
  boardId?: string | null
  boardName?: string | null
  areaPath?: string | null
  assignee?: string | null
  assigneeAvatarUrl?: string | null
  tfsUrl?: string | null
  startDate: string
  targetDate: string
  userStartDate?: string | null
  requirements: Requirement[]
}

export type LinkedError = {
  id: number
  title: string
  state: string
  column?: string | null
  assignee?: string | null
  assigneeAvatarUrl?: string | null
  tfsUrl?: string | null
}

export type Requirement = {
  id: number
  title: string
  state: string
  /** Релиз из TFS (FieldInRelease), например 2026.06.02.0-R */
  release?: string | null
  /** Колонка Kanban-доски TFS (System.BoardColumn), если отличается от workflow State. */
  column?: string | null
  assignee?: string | null
  assigneeAvatarUrl?: string | null
  tfsUrl?: string | null
  startDate?: string | null
  targetDate?: string | null
  errors?: LinkedError[]
}

export type ChangeRequest = {
  id: number
  title: string
  state: string
  /** Релиз из TFS (FieldInRelease), например 2026.06.02.0-R */
  release?: string | null
  /** Колонка Kanban-доски TFS (System.BoardColumn), если отличается от workflow State. */
  column?: string | null
  /** Теги TFS (System.Tags), через «;». */
  tags?: string[]
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
  errors?: LinkedError[]
}

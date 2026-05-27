const METRICS_STREAM_BOARD_KEY = 'metrics-stream-board-id'

export function readMetricsStreamBoardId(): string {
  try {
    return localStorage.getItem(METRICS_STREAM_BOARD_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function writeMetricsStreamBoardId(boardId: string) {
  try {
    if (!boardId.trim()) {
      localStorage.removeItem(METRICS_STREAM_BOARD_KEY)
      return
    }
    localStorage.setItem(METRICS_STREAM_BOARD_KEY, boardId.trim())
  } catch {
    /* ignore */
  }
}

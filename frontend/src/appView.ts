export type AppView = 'roadmap' | 'metrics'

const APP_VIEW_KEY = 'app-active-sheet'

export function readAppView(): AppView {
  try {
    const saved = localStorage.getItem(APP_VIEW_KEY)
    if (saved === 'roadmap' || saved === 'metrics') return saved
  } catch {
    /* ignore */
  }
  return 'roadmap'
}

export function writeAppView(view: AppView) {
  try {
    localStorage.setItem(APP_VIEW_KEY, view)
  } catch {
    /* ignore */
  }
}

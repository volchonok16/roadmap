import type { AppView } from './appView'

type SheetTab = {
  id: AppView
  label: string
}

const TABS: SheetTab[] = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'metrics', label: 'Метрики' },
]

type SheetTabsProps = {
  active: AppView
  onChange: (view: AppView) => void
}

export default function SheetTabs({ active, onChange }: SheetTabsProps) {
  return (
    <nav className="sheet-tabs" aria-label="Страницы приложения">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`sheet-tab ${active === tab.id ? 'is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

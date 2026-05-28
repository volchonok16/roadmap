import { useEffect, useState } from 'react'
import { readAppView, writeAppView, type AppView } from './appView'
import MetricsScreen from './MetricsScreen'
import RoadmapScreen from './RoadmapScreen'
import SheetTabs from './SheetTabs'
import './App.css'

type AppWorkspaceProps = {
  onLogout: () => void
}

export default function AppWorkspace({ onLogout }: AppWorkspaceProps) {
  const [view, setView] = useState<AppView>(readAppView)
  // Lazy mount: MetricsScreen монтируется только при первом переходе на вкладку.
  // После этого остаётся в DOM (hidden), чтобы сохранить состояние.
  const [metricsEverVisited, setMetricsEverVisited] = useState(() => readAppView() === 'metrics')

  useEffect(() => {
    writeAppView(view)
    if (view === 'metrics') setMetricsEverVisited(true)
  }, [view])

  return (
    <div className="app-workspace">
      <div className="app-workspace-content">
        <div className="app-workspace-pane" hidden={view !== 'roadmap'}>
          <RoadmapScreen onLogout={onLogout} />
        </div>
        <div className="app-workspace-pane" hidden={view !== 'metrics'}>
          {metricsEverVisited && <MetricsScreen onLogout={onLogout} />}
        </div>
      </div>
      <SheetTabs active={view} onChange={setView} />
    </div>
  )
}

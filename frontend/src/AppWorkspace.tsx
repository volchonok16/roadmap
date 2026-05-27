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

  useEffect(() => {
    writeAppView(view)
  }, [view])

  return (
    <div className="app-workspace">
      <div className="app-workspace-content">
        {view === 'roadmap' ? <RoadmapScreen onLogout={onLogout} /> : <MetricsScreen onLogout={onLogout} />}
      </div>
      <SheetTabs active={view} onChange={setView} />
    </div>
  )
}

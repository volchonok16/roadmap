import { useCallback, useEffect, useState } from 'react'
import { applySessionFromUrl, clearSessionId, getJson, getSessionId } from './api'
import Login from './Login'
import RoadmapScreen from './RoadmapScreen'
import './App.css'

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)

  const checkAuth = useCallback(async () => {
    const sessionId = getSessionId()
    if (!sessionId) {
      setAuthenticated(false)
      return
    }
    try {
      const status = await getJson<{ authenticated: boolean }>('/api/auth/status')
      setAuthenticated(status.authenticated)
      if (!status.authenticated) clearSessionId()
    } catch {
      setAuthenticated(false)
      clearSessionId()
    }
  }, [])

  useEffect(() => {
    applySessionFromUrl()
    void checkAuth()
  }, [checkAuth])

  if (authenticated === null) {
    return <main className="app-shell loading-shell">Проверяем сессию...</main>
  }

  if (!authenticated) {
    return (
      <Login
        initialError={authError}
        onSuccess={() => {
          setAuthError(null)
          setAuthenticated(true)
        }}
      />
    )
  }

  return <RoadmapScreen onLogout={() => setAuthenticated(false)} />
}

export default App

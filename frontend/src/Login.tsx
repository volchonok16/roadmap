import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch, getJson, readApiError, setSessionId } from './api'
import './login.css'

type AuthMode = 'account' | 'token'

type LoginResponse = {
  sessionId: string
}

type AuthDefaults = {
  baseUrl: string
  project: string
  projectId?: string | null
}

type LoginProps = {
  onSuccess: () => void
  initialError?: string | null
}

const fallback: AuthDefaults = {
  baseUrl: 'https://tfs.t2.ru/tfs/Main',
  project: 'Tele2',
  projectId: 'c56fb5fe-9752-462a-82ae-0b9e10364510',
}

export default function Login({ onSuccess, initialError }: LoginProps) {
  const [mode, setMode] = useState<AuthMode>('account')
  const [baseUrl, setBaseUrl] = useState(fallback.baseUrl)
  const [project, setProject] = useState(fallback.project)
  const [projectId, setProjectId] = useState(fallback.projectId ?? '')
  const [domain, setDomain] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pat, setPat] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  useEffect(() => {
    void getJson<AuthDefaults>('/api/auth/defaults')
      .then((payload) => {
        setBaseUrl(payload.baseUrl)
        setProject(payload.project)
        setProjectId(payload.projectId ?? '')
      })
      .catch(() => undefined)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const body = {
      baseUrl: baseUrl.trim(),
      project: project.trim(),
      projectId: projectId.trim() || null,
      domain: domain.trim() || null,
      username: mode === 'account' ? username.trim() : null,
      password: mode === 'account' ? password : null,
      pat: mode === 'token' ? pat.trim() : null,
      cookie: null,
      extraHeaders: null,
    }

    if (mode === 'account' && (!body.username || !body.password)) {
      setError('Введите учётную запись и пароль.')
      setLoading(false)
      return
    }
    if (mode === 'token' && !body.pat) {
      setError('Введите токен PAT.')
      setLoading(false)
      return
    }

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      const payload = (await response.json()) as LoginResponse
      setSessionId(payload.sessionId)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти в TFS')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <header className="login-brand">
          <span className="login-mark" aria-hidden>
            <span className="login-mark-glyph">TR</span>
          </span>
          <div>
            <p className="login-kicker">TFS Roadmap</p>
            <h1>Вход в TFS</h1>
          </div>
        </header>

        <p className="login-lead">
          Логин и пароль как на tfs.t2.ru. Если логин с <strong>@t2.ru</strong> — чаще нужен <strong>токен PAT</strong>{' '}
          (вкладка справа): NetScaler не отдаёт пароль в API.
        </p>

        <div className="login-tabs" role="tablist">
          <button type="button" className={mode === 'account' ? 'active' : ''} onClick={() => setMode('account')}>
            Учётная запись
          </button>
          <button type="button" className={mode === 'token' ? 'active' : ''} onClick={() => setMode('token')}>
            Токен PAT
          </button>
        </div>

        <form className="login-fields" onSubmit={submit}>
          {mode === 'account' ? (
            <>
              <label className="field">
                <span>Логин</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="TELE2\\ivanov или ivanov (без @)"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="field">
                <span>Пароль</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            </>
          ) : (
            <label className="field">
              <span>Personal Access Token</span>
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="TFS → User settings → PAT"
                autoComplete="off"
                required
              />
            </label>
          )}

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-primary" disabled={loading}>
            {loading ? 'Проверяем…' : 'Войти'}
          </button>
        </form>

        <button type="button" className="login-more" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Скрыть настройки' : 'Настройки'}
        </button>

        {showAdvanced && (
          <div className="login-advanced">
            <label className="field">
              <span>Домен AD (если логин без TELE2\)</span>
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="TELE2" />
            </label>
            <p className="login-note">
              Для <code>name@t2.ru</code> используйте PAT. Либо логин <code>TELE2\name</code> и пароль от портала.
            </p>
            <label className="field">
              <span>TFS URL</span>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </label>
            <div className="login-row">
              <label className="field">
                <span>Проект</span>
                <input value={project} onChange={(e) => setProject(e.target.value)} />
              </label>
              <label className="field">
                <span>Project ID</span>
                <input value={projectId} onChange={(e) => setProjectId(e.target.value)} />
              </label>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

const DEFAULTS = {
  apiUrl: 'http://localhost:8000',
  appUrl: 'http://localhost:5173',
  baseUrl: 'https://tfs.t2.ru/tfs/Main',
  project: 'Tele2',
  projectId: 'c56fb5fe-9752-462a-82ae-0b9e10364510',
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS)
  return { ...DEFAULTS, ...stored }
}

async function buildCookieHeader() {
  const cookies = await chrome.cookies.getAll({ domain: 'tfs.t2.ru' })
  if (!cookies.length) {
    throw new Error('Нет cookie tfs.t2.ru. Откройте TFS в браузере и войдите.')
  }
  return cookies.map((item) => `${item.name}=${item.value}`).join('; ')
}

async function findRoadmapTab(appUrl) {
  const prefix = appUrl.replace(/\/$/, '')
  const tabs = await chrome.tabs.query({ url: [`${prefix}/*`] })
  return tabs[0] ?? null
}

async function notifyRoadmap(sessionId, appUrl) {
  const tab = await findRoadmapTab(appUrl)
  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'tfs-bridge', sessionId })
    await chrome.tabs.update(tab.id, { active: true })
    return 'Сессия передана во вкладку Roadmap.'
  }

  const created = await chrome.tabs.create({ url: `${appUrl.replace(/\/$/, '')}/?session=${encodeURIComponent(sessionId)}` })
  return created.id ? 'Открыта новая вкладка Roadmap.' : 'Roadmap открыт.'
}

document.getElementById('connect').addEventListener('click', async () => {
  const status = document.getElementById('status')
  const button = document.getElementById('connect')
  button.disabled = true
  status.textContent = 'Читаем сессию TFS...'
  status.className = 'status'

  try {
    const settings = await loadSettings()
    const cookie = await buildCookieHeader()
    const response = await fetch(`${settings.apiUrl}/api/auth/bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookie,
        baseUrl: settings.baseUrl,
        project: settings.project,
        projectId: settings.projectId,
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const payload = await response.json()
    const message = await notifyRoadmap(payload.sessionId, settings.appUrl)
    status.textContent = message
    status.className = 'status ok'
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error)
    status.className = 'status error'
  } finally {
    button.disabled = false
  }
})

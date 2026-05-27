import type { ChangeRequest } from './roadmapTypes'

function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase()
}

function normalizeIdToken(query: string) {
  return query.replace(/^#/, '').trim()
}

/** Поиск по id, названию, релизу ЗНИ и требований. */
export function zniMatchesSearch(item: ChangeRequest, query: string) {
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return true

  const idToken = normalizeIdToken(normalized)
  if (idToken && String(item.id).includes(idToken)) return true

  if (item.title.toLowerCase().includes(normalized)) return true

  const release = item.release?.trim().toLowerCase()
  if (release && release.includes(normalized)) return true

  for (const requirement of item.requirements) {
    if (idToken && String(requirement.id).includes(idToken)) return true
    if (requirement.title.toLowerCase().includes(normalized)) return true
    const reqRelease = requirement.release?.trim().toLowerCase()
    if (reqRelease && reqRelease.includes(normalized)) return true
  }

  return false
}

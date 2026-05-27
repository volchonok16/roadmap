import type { ChangeRequest } from './roadmapTypes'

/** Релиз в названии ЗНИ/требования: 2026.06.02.0-R */
export const RELEASE_LABEL_RE = /\b(20\d{2}\.\d{2}\.\d{2}\.\d+-R)\b/

export type UpcomingRelease = {
  label: string
  date: Date
}

export function parseReleaseLabelFromTitle(title: string) {
  const match = title.match(RELEASE_LABEL_RE)
  return match?.[1] ?? null
}

export function parseReleaseDateFromLabel(label: string) {
  const match = label.match(/^(\d{4})\.(\d{2})\.(\d{2})\.\d+-R$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return new Date(year, month - 1, day)
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Релиз попадает на шкалу: в пределах периода; не «прошлый» относительно сегодня, если период ещё актуален. */
export function isReleaseVisibleOnTimeline(
  day: Date,
  today: Date,
  periodStart: Date,
  periodEnd: Date,
) {
  const dayStart = startOfDay(day)
  const todayStart = startOfDay(today)
  if (dayStart < periodStart || dayStart > periodEnd) return false
  // Прошлый квартал/месяц: показываем все релизы внутри выбранного периода.
  if (todayStart > periodEnd) return true
  return dayStart >= todayStart
}

/** Релизы ЗНИ и требований в выбранном периоде (уникальные даты). */
export function collectUpcomingReleases(
  items: ChangeRequest[],
  today: Date,
  from: Date,
  to: Date,
): UpcomingRelease[] {
  const periodStart = startOfDay(from)
  const periodEnd = startOfDay(to)
  const byLabel = new Map<string, Date>()

  const considerRelease = (release: string | null | undefined, title: string) => {
    const label = release?.trim() || parseReleaseLabelFromTitle(title)
    if (!label) return
    const date = parseReleaseDateFromLabel(label)
    if (!date) return
    const day = startOfDay(date)
    if (!isReleaseVisibleOnTimeline(day, today, periodStart, periodEnd)) return
    if (!byLabel.has(label)) byLabel.set(label, day)
  }

  for (const item of items) {
    considerRelease(item.release, item.title)
    for (const requirement of item.requirements) {
      considerRelease(requirement.release, requirement.title)
    }
  }

  return [...byLabel.entries()]
    .map(([label, date]) => ({ label, date }))
    .sort((left, right) => left.date.getTime() - right.date.getTime())
}

/** Ближайший релиз: следующий по календарю от сегодня, иначе — с минимальной дистанцией до сегодня. */
export function pickNearestRelease(releases: UpcomingRelease[], today: Date): UpcomingRelease | null {
  if (!releases.length) return null
  const todayStart = startOfDay(today)
  const upcoming = releases.find((release) => startOfDay(release.date) >= todayStart)
  if (upcoming) return upcoming

  let nearest = releases[0]
  let minDistance = Math.abs(startOfDay(nearest.date).getTime() - todayStart.getTime())
  for (const release of releases.slice(1)) {
    const distance = Math.abs(startOfDay(release.date).getTime() - todayStart.getTime())
    if (distance < minDistance) {
      minDistance = distance
      nearest = release
    }
  }
  return nearest
}

export type ReleasesDisplayMode = 'nearest' | 'subsequent' | 'all'

export function filterReleasesForDisplayMode(
  releases: UpcomingRelease[],
  mode: ReleasesDisplayMode,
  today: Date,
): UpcomingRelease[] {
  if (mode === 'all') return releases
  const nearest = pickNearestRelease(releases, today)
  if (!nearest) return []
  if (mode === 'nearest') return [nearest]
  const nearestTime = startOfDay(nearest.date).getTime()
  return releases.filter((release) => startOfDay(release.date).getTime() > nearestTime)
}

export type ReleaseTimelineMarker = UpcomingRelease & {
  left: number
}

export function buildReleaseTimelineMarkers(
  items: ChangeRequest[],
  today: Date,
  from: Date,
  to: Date,
  progressLeft: (date: Date, from: Date, to: Date) => number,
): ReleaseTimelineMarker[] {
  return collectUpcomingReleases(items, today, from, to).map((release) => ({
    ...release,
    left: progressLeft(release.date, from, to),
  }))
}

import { describe, expect, it } from 'vitest'
import {
  collectUpcomingReleases,
  filterReleasesForDisplayMode,
  isReleaseVisibleOnTimeline,
  parseReleaseDateFromLabel,
  pickNearestRelease,
} from './releaseUtils'
import type { ChangeRequest } from './roadmapTypes'

function localDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

describe('isReleaseVisibleOnTimeline', () => {
  it('hides past releases in current period', () => {
    const day = localDate('2026-05-01')
    const today = localDate('2026-05-26')
    const from = localDate('2026-04-01')
    const to = localDate('2026-07-01')
    expect(isReleaseVisibleOnTimeline(day, today, from, to)).toBe(false)
  })

  it('shows all releases inside a fully historical period', () => {
    const day = localDate('2024-04-02')
    const today = localDate('2026-05-26')
    const from = localDate('2024-04-01')
    const to = localDate('2024-07-01')
    expect(isReleaseVisibleOnTimeline(day, today, from, to)).toBe(true)
  })
})

describe('collectUpcomingReleases', () => {
  it('deduplicates by release label', () => {
    const items: ChangeRequest[] = [
      {
        id: 1,
        title: 'A',
        state: 'Dev',
        release: '2026.06.02.0-R',
        startDate: '2026-04-01',
        targetDate: '2026-07-01',
        requirements: [
          {
            id: 2,
            title: 'B',
            state: 'Closed',
            release: '2026.06.02.0-R',
          },
        ],
      },
      {
        id: 3,
        title: 'C',
        state: 'Dev',
        release: '2026.06.16.0-R',
        startDate: '2026-04-01',
        targetDate: '2026-07-01',
        requirements: [],
      },
    ]
    const releases = collectUpcomingReleases(
      items,
      localDate('2026-05-26'),
      localDate('2026-04-01'),
      localDate('2026-07-01'),
    )
    expect(releases.map((item) => item.label)).toEqual(['2026.06.02.0-R', '2026.06.16.0-R'])
    expect(parseReleaseDateFromLabel('2026.06.02.0-R')?.getMonth()).toBe(5)
  })
})

describe('pickNearestRelease', () => {
  it('picks earliest upcoming release', () => {
    const releases = [
      { label: '2026.06.02.0-R', date: localDate('2026-06-02') },
      { label: '2026.06.16.0-R', date: localDate('2026-06-16') },
    ]
    expect(pickNearestRelease(releases, localDate('2026-05-26'))?.label).toBe('2026.06.02.0-R')
  })
})

describe('filterReleasesForDisplayMode', () => {
  const releases = [
    { label: '2026.06.02.0-R', date: localDate('2026-06-02') },
    { label: '2026.06.16.0-R', date: localDate('2026-06-16') },
    { label: '2026.06.30.0-R', date: localDate('2026-06-30') },
  ]
  const today = localDate('2026-05-26')

  it('keeps only nearest release', () => {
    expect(filterReleasesForDisplayMode(releases, 'nearest', today).map((r) => r.label)).toEqual([
      '2026.06.02.0-R',
    ])
  })

  it('keeps releases after nearest', () => {
    expect(filterReleasesForDisplayMode(releases, 'subsequent', today).map((r) => r.label)).toEqual([
      '2026.06.16.0-R',
      '2026.06.30.0-R',
    ])
  })

  it('keeps all releases', () => {
    expect(filterReleasesForDisplayMode(releases, 'all', today)).toHaveLength(3)
  })
})

import { describe, expect, it } from 'vitest'
import {
  isLinkedError,
  linkedErrorColumnLabel,
  normalizeChangeRequest,
  normalizeLinkedErrors,
  visibleLinkedErrors,
} from './linkedErrors'
import type { ChangeRequest } from './roadmapTypes'

describe('normalizeLinkedErrors', () => {
  it('drops invalid rows and keeps valid ones', () => {
    const list = normalizeLinkedErrors([
      { id: 1, title: 'Bug', state: 'New' },
      { id: 2, title: '', state: 'New' },
      null,
      { id: 3, state: 'Closed' },
    ] as never)
    expect(list).toEqual([{ id: 1, title: 'Bug', state: 'New' }])
  })

  it('returns empty array for missing list', () => {
    expect(normalizeLinkedErrors(undefined)).toEqual([])
    expect(normalizeLinkedErrors([])).toEqual([])
  })
})

describe('normalizeChangeRequest', () => {
  it('deduplicates zni errors already shown under requirement', () => {
    const item: ChangeRequest = {
      id: 10,
      title: 'ZNI',
      state: 'Dev',
      startDate: '2026-01-01',
      targetDate: '2026-06-01',
      requirements: [
        {
          id: 20,
          title: 'Req',
          state: 'Closed',
          errors: [{ id: 99, title: 'E', state: 'New' }],
        },
      ],
      errors: [
        { id: 99, title: 'E', state: 'New' },
        { id: 100, title: 'Only on ZNI', state: 'Closed' },
      ],
    }
    const normalized = normalizeChangeRequest(item)
    expect(normalized.requirements[0].errors).toHaveLength(1)
    expect(normalized.errors).toEqual([{ id: 100, title: 'Only on ZNI', state: 'Closed' }])
  })
})

describe('visibleLinkedErrors', () => {
  it('hides errors in hidden columns like requirements', () => {
    const errors = [
      { id: 1, title: 'Open', state: 'Development' },
      { id: 2, title: 'Done', state: 'Closed', column: 'Closed' },
    ]
    const hidden = ['col::closed']
    expect(visibleLinkedErrors(errors, hidden).map((row) => row.id)).toEqual([1])
    expect(linkedErrorColumnLabel(errors[1])).toBe('Closed')
  })

  it('maps Done workflow state to Closed filter', () => {
    const errors = [
      { id: 1, title: 'Open', state: 'Test' },
      { id: 2, title: 'Old', state: 'Done' },
    ]
    expect(visibleLinkedErrors(errors, ['col::closed']).map((row) => row.id)).toEqual([1])
    expect(linkedErrorColumnLabel(errors[1])).toBe('Closed')
  })

})

describe('isLinkedError', () => {
  it('validates shape', () => {
    expect(isLinkedError({ id: 1, title: 'x', state: 'New' })).toBe(true)
    expect(isLinkedError({ id: 1, title: 'x' })).toBe(false)
  })
})

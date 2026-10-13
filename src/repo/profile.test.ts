import { beforeEach, describe, expect, it } from 'vitest'
import type { Profile } from '../db/types'
import { resetDb } from '../test/db'
import { getProfile, saveProfile } from './profile'

beforeEach(resetDb)

const input: Omit<Profile, 'id' | 'updatedAt'> = {
  goal: 'hypertrophy',
  experience: 'y1_3',
  daysPerWeek: 4,
  minutesPerSession: 60,
  weekdays: [1, 2, 4, 5],
  equipment: ['gym_free', 'gym_machine'],
  injuries: '',
  baselines: [{ exerciseId: 'ex-bench-press', weight: 60, reps: 8 }],
}

describe('profile', () => {
  it('未保存なら undefined', async () => {
    expect(await getProfile()).toBeUndefined()
  })

  it('保存して読める（1件だけ）', async () => {
    await saveProfile(input)
    expect(await getProfile()).toMatchObject({ ...input, id: 'me' })
    await saveProfile({ ...input, daysPerWeek: 3, preferredSplit: 'ppl' })
    const p = await getProfile()
    expect(p).toMatchObject({ id: 'me', daysPerWeek: 3, preferredSplit: 'ppl' })
    expect(p?.updatedAt).toBeTypeOf('number')
  })
})

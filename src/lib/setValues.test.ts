import { describe, expect, it } from 'vitest'
import { defaultSets, valuesOf } from './setValues'

describe('valuesOf', () => {
  it('セットの値だけを取り出す', () => {
    expect(valuesOf({ weight: 60, reps: 8, done: true, id: 'x' } as never)).toEqual({ weight: 60, reps: 8 })
  })
})

describe('defaultSets', () => {
  it('重量×回数は 20kg×10回 を3セット', () => {
    expect(defaultSets('weight_reps', 'chest')).toEqual([
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
    ])
  })
  it('回数のみは10回を3セット', () => {
    expect(defaultSets('reps', 'back')).toEqual([{ reps: 10 }, { reps: 10 }, { reps: 10 }])
  })
  it('有酸素は30分を1セット、それ以外の時間種目は60秒を3セット', () => {
    expect(defaultSets('time_distance', 'cardio')).toEqual([{ durationSec: 1800 }])
    expect(defaultSets('time_distance', 'abs')).toEqual([{ durationSec: 60 }, { durationSec: 60 }, { durationSec: 60 }])
  })
})

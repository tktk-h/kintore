import { describe, expect, it } from 'vitest'
import { weightStepFor } from './weightStep'

describe('weightStepFor', () => {
  it('ダンベルの種目はダンベルの刻み幅、それ以外は重量の刻み幅', () => {
    const s = { weightStep: 2.5, dumbbellStep: 2 }
    expect(weightStepFor(s, 'dumbbell')).toBe(2)
    expect(weightStepFor(s, 'barbell')).toBe(2.5)
    expect(weightStepFor(s, 'machine')).toBe(2.5)
    expect(weightStepFor(s, undefined)).toBe(2.5)
  })

  it('ダンベルの刻み幅がない・正しくないときは1kg', () => {
    expect(weightStepFor({ weightStep: 2.5 }, 'dumbbell')).toBe(1)
    expect(weightStepFor({ weightStep: 2.5, dumbbellStep: 0 }, 'dumbbell')).toBe(1)
  })
})

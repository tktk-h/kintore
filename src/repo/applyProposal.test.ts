import { beforeEach, describe, expect, it } from 'vitest'
import type { Proposal } from '../coach/types'
import { db } from '../db/db'
import { resetDb } from '../test/db'
import { applyProposal } from './applyProposal'
import { addChatMessage, listChatMessages } from './chat'
import { assignRoutineToDate, getPlanForDate } from './plans'
import { createRoutine } from './routines'

beforeEach(resetDb)

const proposal = (p: Partial<Proposal> = {}): Proposal => ({
  split: 'upper_lower',
  reasons: '理由',
  issues: [],
  muscleSets: {},
  days: [
    {
      date: '2026-10-19', title: '上半身',
      exercises: [
        { slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 6, repRange: [6, 10], restSec: 150, weight: 100 },
        { slot: 'upper.9', exerciseId: 'ex-push-up', sets: 2, reps: 12, repRange: [10, 15], restSec: 60 },
      ],
    },
    {
      date: '2026-10-20', title: '下半身',
      exercises: [{ slot: 'lower.6', exerciseId: 'ex-plank', sets: 2, reps: 1, repRange: [1, 1], restSec: 45 }],
    },
  ],
  ...p,
})

const activePlans = async () => (await db.plannedWorkouts.toArray()).filter((p) => !p.deleted)

describe('applyProposal', () => {
  it('各日をAIの予定として保存し、反映済みにする', async () => {
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal() })
    const saved = await applyProposal(m.id)
    expect(saved).toHaveLength(2)

    const upper = await getPlanForDate('2026-10-19')
    expect(upper).toMatchObject({ title: '上半身', source: 'ai' })
    expect(upper?.deload).toBeUndefined()
    expect(upper?.exercises[0]).toEqual({
      exerciseId: 'ex-bench-press', restSec: 150, slot: 'upper.1', repRange: [6, 10],
      sets: [{ weight: 100, reps: 6 }, { weight: 100, reps: 6 }, { weight: 100, reps: 6 }],
    })
    expect(upper?.exercises[1].sets).toEqual([{ reps: 12 }, { reps: 12 }])
    // 時間の種目は回数ではなく時間の初期値
    expect((await getPlanForDate('2026-10-20'))?.exercises[0].sets).toEqual([{ durationSec: 60 }, { durationSec: 60 }])

    expect((await listChatMessages())[0].appliedAt).toBeTypeOf('number')
  })

  it('軽めの週の案なら予定に印をつける', async () => {
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal({ deload: true }) })
    await applyProposal(m.id)
    expect((await getPlanForDate('2026-10-19'))?.deload).toBe(true)
  })

  it('その日の既存の予定を置き換える', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: [] })
    const old = await assignRoutineToDate(r.id, '2026-10-19')
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal() })
    await applyProposal(m.id)
    expect((await db.plannedWorkouts.get(old.id))?.deleted).toBe(true)
    expect((await getPlanForDate('2026-10-19'))?.title).toBe('上半身')
    expect(await activePlans()).toHaveLength(2)
  })

  it('2回押しても重複しない', async () => {
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal() })
    await applyProposal(m.id)
    expect(await applyProposal(m.id)).toEqual([])
    expect(await activePlans()).toHaveLength(2)
  })

  it('案がないメッセージは反映できない', async () => {
    const m = await addChatMessage({ role: 'coach', text: 'こんにちは' })
    await expect(applyProposal(m.id)).rejects.toThrow('メニュー案が見つかりません')
  })
})

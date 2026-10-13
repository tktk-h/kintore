import { beforeEach, describe, expect, it } from 'vitest'
import type { Proposal } from '../coach/types'
import { db } from '../db/db'
import { resetDb } from '../test/db'
import { applyProposal } from './applyProposal'
import { addChatMessage, listChatMessages } from './chat'
import { assignRoutineToDate, getPlanForDate } from './plans'
import { createRoutine } from './routines'

beforeEach(resetDb)

const TODAY = '2026-10-14'

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
    const saved = await applyProposal(m.id, TODAY)
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
    await applyProposal(m.id, TODAY)
    expect((await getPlanForDate('2026-10-19'))?.deload).toBe(true)
  })

  it('その日の既存の予定を置き換える', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: [] })
    const old = await assignRoutineToDate(r.id, '2026-10-19')
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal() })
    await applyProposal(m.id, TODAY)
    expect((await db.plannedWorkouts.get(old.id))?.deleted).toBe(true)
    expect((await getPlanForDate('2026-10-19'))?.title).toBe('上半身')
    expect(await activePlans()).toHaveLength(2)
  })

  it('2回押しても重複しない', async () => {
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal() })
    await applyProposal(m.id, TODAY)
    expect(await applyProposal(m.id, TODAY)).toEqual([])
    expect(await activePlans()).toHaveLength(2)
  })

  it('案がないメッセージは反映できない', async () => {
    const m = await addChatMessage({ role: 'coach', text: 'こんにちは' })
    await expect(applyProposal(m.id, TODAY)).rejects.toThrow('メニュー案が見つかりません')
  })

  it('同じ日付が2回あれば1つの予定にまとめる（どちらの種目も落とさない）', async () => {
    const base = proposal()
    const dup = proposal({
      days: [...base.days, { date: '2026-10-19', title: '腕', exercises: [{ slot: 'upper.7', exerciseId: 'ex-dumbbell-curl', sets: 2, reps: 10, repRange: [10, 15], restSec: 75, weight: 5 }] }],
    })
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: dup })
    const saved = await applyProposal(m.id, TODAY)
    expect(saved).toHaveLength(2)
    const plan = await getPlanForDate('2026-10-19')
    expect(plan?.title).toBe('上半身・腕')
    expect(plan?.exercises.map((x) => x.exerciseId)).toEqual(['ex-bench-press', 'ex-push-up', 'ex-dumbbell-curl'])
    expect(await activePlans()).toHaveLength(2)
  })

  it('過ぎた日は反映せず、今日以降の日だけ反映する', async () => {
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal() })
    const saved = await applyProposal(m.id, '2026-10-20')
    expect(saved.map((p) => p.date)).toEqual(['2026-10-20'])
    expect(await getPlanForDate('2026-10-19')).toBeUndefined()
    expect((await listChatMessages())[0].appliedAt).toBeTypeOf('number')
  })

  it('すべて過ぎた日の案は反映できない（何も変えない）', async () => {
    const m = await addChatMessage({ role: 'coach', text: '案', proposal: proposal() })
    await expect(applyProposal(m.id, '2026-10-21')).rejects.toThrow('過ぎた日')
    expect(await activePlans()).toHaveLength(0)
    expect((await listChatMessages())[0].appliedAt).toBeUndefined()
  })
})

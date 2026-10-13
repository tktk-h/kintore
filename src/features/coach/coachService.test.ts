import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoachReply, CoachRequest } from '../../../api/_lib/schema'
import { buildSkeleton } from '../../coach/skeleton'
import type { Skeleton } from '../../coach/types'
import type { MovementPattern, Profile } from '../../db/types'
import { db } from '../../db/db'
import type { SetRecord, Workout, WorkoutExercise } from '../../db/types'
import { newRecord } from '../../lib/records'
import { listChatMessages } from '../../repo/chat'
import { saveProfile } from '../../repo/profile'
import { saveSettings } from '../../repo/settings'
import { resetDb } from '../../test/db'
import { CoachError } from './client'
import { askCoach, NO_PROFILE_MESSAGE } from './coachService'

const TODAY = '2026-10-14' // 水
const NEXT = '2026-10-19'

const profile: Omit<Profile, 'id' | 'updatedAt'> = {
  goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60, weekdays: [1, 2, 4, 5],
  equipment: ['gym_free', 'gym_machine'], injuries: '', baselines: [{ exerciseId: 'ex-bench-press', weight: 100, reps: 5 }],
}

const PICK: Partial<Record<MovementPattern, string>> = {
  horizontal_push: 'ex-bench-press', horizontal_pull: 'ex-seated-cable-row', vertical_push: 'ex-dumbbell-shoulder-press',
  vertical_pull: 'ex-lat-pulldown', chest_isolation: 'ex-pec-deck', side_delt: 'ex-side-raise', biceps: 'ex-dumbbell-curl',
  triceps: 'ex-triceps-pushdown', squat: 'ex-squat', hinge: 'ex-romanian-deadlift', single_leg: 'ex-bulgarian-split-squat',
  hamstring: 'ex-leg-curl', calf: 'ex-calf-raise', core: 'ex-crunch',
}

const skeletonFor = (weekStart: string, from?: string): Skeleton =>
  buildSkeleton({ profile: { ...profile, id: 'me', updatedAt: 0 }, weekStart, weeksSinceDeload: 0, from })

/** 骨組みどおりの正しい返事 */
function goodReply(s: Skeleton = skeletonFor(NEXT), from = ''): CoachReply {
  return {
    message: '来週のメニューです',
    proposal: {
      split: s.split,
      reasons: '前の週と同じ種目を続けます',
      days: s.days.filter((d) => d.date >= from).map((d) => ({
        date: d.date, title: d.title,
        exercises: d.slots.map((x) => ({ slot: x.slot, exerciseId: PICK[x.patterns[0]]!, sets: x.sets, reps: x.repRange[0], restSec: x.restSec })),
      })),
    },
  }
}
/** 候補にない種目が入った返事 */
function badReply(): CoachReply {
  const r = goodReply()
  r.proposal!.days[0].exercises[0].exerciseId = 'ex-nope'
  return r
}

beforeEach(async () => {
  await resetDb()
  await saveProfile(profile)
  await saveSettings({ coachPasscode: 'pass' })
})

describe('askCoach', () => {
  it('正しい案はそのまま保存し、重さと回数をアプリが計算する', async () => {
    const send = vi.fn(async (_body: CoachRequest, _pass: string) => goodReply())
    const m = await askCoach('来週のメニューを作って', { intent: 'next_week', today: TODAY, send })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][1]).toBe('pass')
    expect(send.mock.calls[0][0].messages.at(-1)).toEqual({ role: 'user', text: '来週のメニューを作って' })
    expect(m.role).toBe('coach')
    expect(m.proposal?.issues).toEqual([])
    expect(m.proposal?.deload).toBe(false)
    expect(m.proposal?.days.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-22', '2026-10-23'])
    const bench = m.proposal!.days[0].exercises[0]
    // プロフィールの 100kg×5 → 推定1RM 116.7 × 6回の割合 0.85 → 99.2 → 100
    expect(bench).toMatchObject({ exerciseId: 'ex-bench-press', repRange: [6, 10], reps: 6, weight: 100 })
    // 記録もプロフィールの重量もない種目は軽めに試す：複数関節は 20kg、単関節・ダンベルは 5kg
    expect(m.proposal!.days[0].exercises[1]).toMatchObject({ exerciseId: 'ex-seated-cable-row', weight: 20 })
    const upper = m.proposal!.days[0].exercises
    expect(upper.find((x) => x.exerciseId === 'ex-side-raise')).toMatchObject({ weight: 5 })
    expect(upper.find((x) => x.exerciseId === 'ex-dumbbell-shoulder-press')).toMatchObject({ weight: 5 })
    expect(upper.find((x) => x.exerciseId === 'ex-triceps-pushdown')).toMatchObject({ weight: 5 })
    expect(m.text).toContain('軽め')
    expect(m.proposal!.muscleSets.chest).toBeGreaterThan(0)

    const chat = await listChatMessages()
    expect(chat.map((c) => [c.role, c.text.slice(0, 6)])).toEqual([['user', '来週のメニュ'], ['coach', '来週のメニュ']])
  })

  it('1回目が不正なら問題の文をつけて作り直しを頼み、2回目を採用する', async () => {
    const send = vi.fn<(b: CoachRequest, p: string) => Promise<CoachReply>>()
      .mockResolvedValueOnce(badReply())
      .mockResolvedValueOnce({ ...goodReply(), message: '直しました' })
    const m = await askCoach('来週のメニューを作って', { intent: 'next_week', today: TODAY, send })
    expect(send).toHaveBeenCalledTimes(2)
    const retry = send.mock.calls[1][0].messages
    expect(retry.at(-1)?.role).toBe('user')
    expect(retry.at(-1)?.text).toContain('候補にない')
    expect(retry.at(-2)?.role).toBe('coach')
    expect(m.text).toBe('直しました\n\n最初は軽めの重さで試して、きつさを記録してください。')
    expect(m.proposal?.issues).toEqual([])
  })

  it('2回とも不正なら注意点（issues）つきで保存する', async () => {
    const send = vi.fn(async () => badReply())
    const m = await askCoach('来週のメニューを作って', { intent: 'next_week', today: TODAY, send })
    expect(send).toHaveBeenCalledTimes(2)
    expect(m.proposal?.issues.join()).toContain('候補にない')
  })

  it('作り直しの呼び出しが失敗しても、1回目の案を注意点つきで保存する', async () => {
    const send = vi.fn<(b: CoachRequest, p: string) => Promise<CoachReply>>()
      .mockResolvedValueOnce(badReply())
      .mockRejectedValueOnce(new CoachError('server'))
    const m = await askCoach('来週のメニューを作って', { intent: 'next_week', today: TODAY, send })
    expect(m.proposal?.issues.length).toBeGreaterThan(0)
  })

  it('メッセージだけの返事はそのまま保存する', async () => {
    const send = vi.fn(async () => ({ message: 'デッドリフトは腰を丸めないように' }))
    const m = await askCoach('デッドリフトのコツは？', { intent: 'chat', today: TODAY, send })
    expect(m).toMatchObject({ role: 'coach', text: 'デッドリフトは腰を丸めないように' })
    expect(m.proposal).toBeUndefined()
  })

  it('エラーのときはユーザーのメッセージだけ保存され、同じ文で送り直しても二重にならない', async () => {
    const fail = vi.fn(async () => { throw new CoachError('rate_limited') })
    await expect(askCoach('来週のメニューを作って', { intent: 'next_week', today: TODAY, send: fail })).rejects.toMatchObject({ kind: 'rate_limited' })
    expect((await listChatMessages()).map((c) => c.role)).toEqual(['user'])

    const send = vi.fn(async (_b: CoachRequest, _p: string) => goodReply())
    await askCoach('来週のメニューを作って', { intent: 'next_week', today: TODAY, send })
    expect((await listChatMessages()).map((c) => c.role)).toEqual(['user', 'coach'])
    // 送り直しのときも、今回のメッセージは1回だけ渡す
    const texts = send.mock.calls[0][0].messages.map((x) => x.text)
    expect(texts.filter((t) => t === '来週のメニューを作って')).toHaveLength(1)
  })

  it('今週の見直しは今週の今日以降の日だけ。過ぎた日の案は注意点になる', async () => {
    const thisWeek = skeletonFor('2026-10-12', TODAY)
    const send = vi.fn(async (_b: CoachRequest, _p: string) => goodReply(thisWeek, TODAY))
    const m = await askCoach('今週を見直して', { intent: 'this_week', today: TODAY, send })
    expect(m.proposal?.days.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16'])
    expect(m.proposal?.issues).toEqual([])
    const ctx = JSON.parse(send.mock.calls[0][0].context)
    expect(ctx.skeleton.days.map((d: { date: string }) => d.date)).toEqual(['2026-10-15', '2026-10-16'])

    const past = vi.fn(async () => goodReply(skeletonFor('2026-10-12')))
    const m2 = await askCoach('今週を見直して', { intent: 'this_week', today: TODAY, send: past })
    expect(m2.proposal?.issues.join()).toContain('過ぎた日')
  })

  describe('今週の見直しで、今週もう終えたトレーニングを数える', () => {
    const THU = '2026-10-15'
    async function finished(date: string, exerciseId: string, sets: number) {
      const w = newRecord<Workout>({ date, startedAt: Date.parse(`${date}T10:00:00`), finishedAt: Date.parse(`${date}T11:00:00`) })
      await db.workouts.add(w)
      const we = newRecord<WorkoutExercise>({ workoutId: w.id, exerciseId, order: 0, restSec: 90 })
      await db.workoutExercises.add(we)
      await db.sets.bulkAdd(Array.from({ length: sets }, (_, i) => newRecord<SetRecord>({
        workoutId: w.id, workoutExerciseId: we.id, order: i, done: true, weight: 60, reps: 8,
      })))
    }
    const skeletonDates = (send: ReturnType<typeof vi.fn>) =>
      JSON.parse((send.mock.calls[0] as unknown as [CoachRequest])[0].context).skeleton.days.map((d: { date: string }) => d.date)
    const reply = vi.fn(async () => ({ message: '了解です' }))

    it('今日まだ終えていなければ今日から', async () => {
      const send = vi.fn(reply)
      await askCoach('今週を見直して', { intent: 'this_week', today: THU, send })
      expect(skeletonDates(send)[0]).toBe(THU)
    })

    it('今日のトレーニングを終えていれば明日から', async () => {
      await finished(THU, 'ex-squat', 3)
      const send = vi.fn(reply)
      await askCoach('今週を見直して', { intent: 'this_week', today: THU, send })
      expect(skeletonDates(send)).toEqual(['2026-10-16'])
    })

    it('「今日できなかった」は明日から', async () => {
      const send = vi.fn(reply)
      await askCoach('今日できなかった', { intent: 'this_week', skipToday: true, today: THU, send })
      expect(skeletonDates(send).every((d: string) => d > THU)).toBe(true)
    })

    it('終えた日は48時間ルールと週のセット数に数え、AIにも伝える', async () => {
      // 水曜にベンチプレス8セット。木曜に上半身（胸）は入れない
      await finished('2026-10-14', 'ex-bench-press', 8)
      const send = vi.fn(reply)
      await askCoach('今週を見直して', { intent: 'this_week', today: THU, send })
      const ctx = JSON.parse((send.mock.calls[0] as unknown as [CoachRequest])[0].context)
      expect(ctx.skeleton.done).toEqual([{ date: '2026-10-14', muscles: ['chest'] }])
      const thu = ctx.skeleton.days.find((d: { date: string }) => d.date === THU)
      expect(thu?.title).not.toBe('上半身')
    })
  })

  it('普通のチャットで今週の案が返ってきたら、今日以降かを確かめる', async () => {
    const thisWeek = skeletonFor('2026-10-12')
    const send = vi.fn(async () => goodReply(thisWeek))
    const m = await askCoach('今日できなかった', { intent: 'chat', today: TODAY, send })
    expect(m.proposal?.issues.join()).toContain('過ぎた日')
  })

  it('プロフィールがなければ送らない', async () => {
    await resetDb()
    const send = vi.fn(async () => goodReply())
    await expect(askCoach('来週のメニューを作って', { intent: 'next_week', today: TODAY, send })).rejects.toThrow(NO_PROFILE_MESSAGE)
    expect(send).not.toHaveBeenCalled()
  })
})

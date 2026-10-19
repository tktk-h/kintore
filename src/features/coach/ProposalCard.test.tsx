import { screen, waitFor, within } from '@testing-library/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoachReply } from '../../../api/_lib/schema'
import { buildSkeleton } from '../../coach/skeleton'
import { db } from '../../db/db'
import type { MovementPattern, Profile, SetRecord, Workout, WorkoutExercise } from '../../db/types'
import { addDays, formatDateJa, mondayOf, todayKey } from '../../lib/dates'
import { newRecord } from '../../lib/records'
import { markProposalApplied } from '../../repo/chat'
import { getPlanForDate } from '../../repo/plans'
import { saveProfile } from '../../repo/profile'
import { saveSettings } from '../../repo/settings'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import userEvent from '../../test/user'
import { askCoach } from './coachService'
import { ProposalCard } from './ProposalCard'

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

function goodReply(): CoachReply {
  const s = buildSkeleton({ profile: { ...profile, id: 'me', updatedAt: 0 }, weekStart: addDays(mondayOf(todayKey()), 7), weeksSinceDeload: 0 })
  return {
    message: '来週のメニューです',
    proposal: {
      split: s.split,
      reasons: '前の週と同じ種目を続けます',
      days: s.days.map((d) => ({
        date: d.date, title: d.title,
        exercises: d.slots.map((x) => ({ slot: x.slot, exerciseId: PICK[x.patterns[0]]!, sets: x.sets, reps: x.repRange[0], restSec: x.restSec })),
      })),
    },
  }
}

/** DB のメッセージを読み直して表示する（保存した案がカードに出るか確かめるため） */
function Harness({ id }: { id: string }) {
  const message = useLiveQuery(() => db.chatMessages.get(id), [id])
  return message ? <ProposalCard message={message} /> : null
}

async function setup() {
  await saveProfile(profile)
  await saveSettings({ coachPasscode: 'pass' })
  const m = await askCoach('来週のメニューを作って', { intent: 'next_week', send: vi.fn(async () => goodReply()) })
  renderPage('/', '/', <Harness id={m.id} />)
  const card = await screen.findByRole('region', { name: 'メニュー案' })
  return { m, card }
}

/** 最初の日の最初の種目（ベンチプレス） */
const benchRow = async (card: HTMLElement) => (await within(card).findAllByRole('button', { name: /^ベンチプレス / }))[0]

beforeEach(resetDb)

describe('メニュー案の見た目（1行の種目と、たためる日）', () => {
  it('種目の行に「回数×セット」と重さを出し、最初の日だけ開いている', async () => {
    const { m, card } = await setup()
    const days = m.proposal!.days
    const bench = days[0].exercises[0]
    const row = await benchRow(card)
    expect(within(row).getByText(`${bench.reps}×${bench.sets}`)).toBeInTheDocument()
    expect(within(row).getByText('100kg')).toBeInTheDocument()
    expect(row).not.toHaveTextContent('休憩')

    const first = within(card).getByRole('region', { name: `${formatDateJa(days[0].date)} ${days[0].title}` })
    const sets = days[0].exercises.reduce((n, x) => n + x.sets, 0)
    expect(first).toHaveTextContent(`${days[0].exercises.length}種目・約${Math.round((sets * 3) / 5) * 5}分`)
    expect(within(first).getByText('胸')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: /をたたむ$/ })).toHaveAttribute('aria-expanded', 'true')

    const second = within(card).getByRole('region', { name: `${formatDateJa(days[1].date)} ${days[1].title}` })
    expect(within(second).queryAllByRole('listitem')).toHaveLength(0)
    const toggle = within(second).getByRole('button', { name: `「${formatDateJa(days[1].date)} ${days[1].title}」を開く` })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(within(second).getAllByRole('listitem')).toHaveLength(days[1].exercises.length)
  })

  it('開いた日の行を押すと詳細のシートが開く', async () => {
    const { m, card } = await setup()
    const day = m.proposal!.days[1]
    const second = within(card).getByRole('region', { name: `${formatDateJa(day.date)} ${day.title}` })
    await userEvent.click(within(second).getByRole('button', { name: /を開く$/ }))
    const { name } = (await db.exercises.get(day.exercises[0].exerciseId))!
    await userEvent.click((await within(second).findAllByRole('button', { name: new RegExp(`^${name} `) }))[0])
    expect(await screen.findByRole('dialog', { name })).toBeInTheDocument()
  })

  it('長い理由は2行に縮めて「続きを読む」で開く', async () => {
    const { m, card } = await setup()
    // goodReply の理由は短いので出ない
    expect(within(card).queryByRole('button', { name: '続きを読む' })).toBeNull()
    const long = '前の週と同じ種目を続けます。'.repeat(6)
    await db.chatMessages.update(m.id, { proposal: { ...m.proposal!, reasons: long } })
    const more = await within(card).findByRole('button', { name: '続きを読む' })
    expect(within(card).getByText(long)).toHaveClass('is-clamped')
    await userEvent.click(more)
    expect(within(card).getByText(long)).not.toHaveClass('is-clamped')
    expect(within(card).getByRole('button', { name: 'たたむ' })).toBeInTheDocument()
  })
})

describe('メニュー案の種目の詳細と編集', () => {
  it('種目の行はボタンで、名前と内容が読み上げられる', async () => {
    const { m, card } = await setup()
    const bench = m.proposal!.days[0].exercises[0]
    const row = await benchRow(card)
    expect(row).toHaveAccessibleName(`ベンチプレス ${bench.reps}×${bench.sets} ・ 100kg ・ 休憩2分30秒`)
  })

  it('詳細を見て、セット数と重さを変えて保存すると、カードに出て、反映した予定にも入る', async () => {
    // 前回の記録（2日前）
    const date = addDays(todayKey(), -2)
    const w = newRecord<Workout>({ date, startedAt: Date.parse(`${date}T10:00:00`), finishedAt: Date.parse(`${date}T11:00:00`) })
    await db.workouts.add(w)
    const we = newRecord<WorkoutExercise>({ workoutId: w.id, exerciseId: 'ex-bench-press', order: 0, restSec: 90 })
    await db.workoutExercises.add(we)
    await db.sets.bulkAdd([8, 8, 7].map((reps, i) => newRecord<SetRecord>({
      workoutId: w.id, workoutExerciseId: we.id, order: i, done: true, weight: 60, reps,
    })))
    await saveSettings({ weightStep: 2.5 })

    const { m, card } = await setup()
    const bench = m.proposal!.days[0].exercises[0]
    const chestBefore = m.proposal!.muscleSets.chest!
    await userEvent.click(await benchRow(card))

    const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
    expect(within(sheet).getByText('水平に押す')).toBeInTheDocument()
    expect(within(sheet).getByText('胸')).toBeInTheDocument()
    expect(within(sheet).getByText('三頭・前肩')).toBeInTheDocument()
    expect(await within(sheet).findByText(`${formatDateJa(date)} 60kg × 8, 8, 7`)).toBeInTheDocument()
    // 前回 60kg×8,8,7（6〜10回の幅の中）なので同じ重さで回数を1回増やす
    expect(within(sheet).getByText('同じ重さで回数を1回増やす')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: `セット数 ${bench.sets}セット` })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '重さ 60kg' })).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole('button', { name: 'セット数を増やす' }))
    await userEvent.click(within(sheet).getByRole('button', { name: '重さを増やす' }))
    await userEvent.click(within(sheet).getByRole('button', { name: '重さを増やす' }))
    expect(within(sheet).getByRole('button', { name: '重さ 65kg' })).toBeInTheDocument()
    expect(within(sheet).getByText('自分で変えた重さ')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const row = await benchRow(card)
    await waitFor(() => expect(row).toHaveAccessibleName(`ベンチプレス ${bench.reps}×${bench.sets + 1} ・ 65kg ・ 休憩2分30秒`))
    // 部位ごとの週のセット数も数え直す
    expect(within(within(card).getByRole('list', { name: '部位ごとの週のセット数' })).getByText('胸').parentElement).toHaveTextContent(`胸 ${chestBefore + 1}`)
    const saved = (await db.chatMessages.get(m.id))!.proposal!
    expect(saved.days[0].exercises[0]).toMatchObject({ sets: bench.sets + 1, weight: 65, weightReason: '自分で変えた重さ' })
    // チェックし直す：1セット増やしたので、この日は1回の時間（60分）を超える
    expect(saved.issues).toHaveLength(1)
    expect(saved.issues[0]).toContain('1回の時間（60分）を超えています')
    expect(within(card).getByText(saved.issues[0])).toBeInTheDocument()

    await userEvent.click(within(card).getByRole('button', { name: '反映する' }))
    expect(await within(card).findByText('反映済み')).toBeInTheDocument()
    const plan = await getPlanForDate(m.proposal!.days[0].date)
    const planned = plan!.exercises[0]
    expect(planned.exerciseId).toBe('ex-bench-press')
    expect(planned.sets).toHaveLength(bench.sets + 1)
    expect(planned.sets[0]).toEqual({ weight: 65, reps: bench.reps })
  })

  it('種目を入れ替えると、回数・休憩・重さを決め直して保存する', async () => {
    const { m, card } = await setup()
    const bench = m.proposal!.days[0].exercises[0]
    await userEvent.click(await benchRow(card))
    const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
    const swap = within(sheet).getByRole('button', { name: '種目を入れ替える' })
    await waitFor(() => expect(swap).toBeEnabled())
    await userEvent.click(swap)
    const list = within(sheet).getByRole('list', { name: '入れ替える種目' })
    expect(within(list).queryByRole('button', { name: /^ベンチプレス/ })).toBeNull()
    expect(within(list).queryByRole('button', { name: /ペックデック/ })).toBeNull()
    await userEvent.click(within(list).getByRole('button', { name: /^ダンベルプレス/ }))

    const swapped = await screen.findByRole('dialog', { name: 'ダンベルプレス' })
    expect(within(swapped).getByText('初心者の目安の重さ')).toBeInTheDocument()
    expect(within(swapped).getByRole('button', { name: '重さ 10kg' })).toBeInTheDocument()
    // ダンベルの種目はダンベルの刻み幅（既定1kg）で変える
    await userEvent.click(within(swapped).getByRole('button', { name: '重さを増やす' }))
    expect(within(swapped).getByRole('button', { name: '重さ 11kg' })).toBeInTheDocument()
    await userEvent.click(within(swapped).getByRole('button', { name: '重さを減らす' }))
    expect(within(swapped).getByRole('button', { name: '重さ 10kg' })).toBeInTheDocument()
    await userEvent.click(within(swapped).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const row = (await within(card).findAllByRole('button', { name: /^ダンベルプレス / }))[0]
    // 筋肥大・1〜3年のメイン（6〜10回・150秒）。セット数はそのまま
    expect(row).toHaveAccessibleName(`ダンベルプレス 6×${bench.sets} ・ 10kg ・ 休憩2分30秒`)
    const saved = (await db.chatMessages.get(m.id))!.proposal!.days[0].exercises[0]
    expect(saved).toMatchObject({ exerciseId: 'ex-dumbbell-press', slot: bench.slot, repRange: [6, 10], weight: 10 })
  })

  it('反映済みの案は詳細だけで、直せない', async () => {
    const { m, card } = await setup()
    await markProposalApplied(m.id)
    await within(card).findByText('反映済み')
    await userEvent.click(await benchRow(card))
    const sheet = await screen.findByRole('dialog', { name: 'ベンチプレス' })
    expect(within(sheet).getByText('プロフィールの重量から計算')).toBeInTheDocument()
    expect(within(sheet).getByText('反映済みのメニュー案なので、ここでは直せません。')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: '保存' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: '種目を入れ替える' })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: /セット数を増やす/ })).toBeNull()
    await userEvent.click(within(sheet).getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoachReply } from '../../../api/_lib/schema'
import { buildSkeleton } from '../../coach/skeleton'
import type { Skeleton } from '../../coach/types'
import type { MovementPattern, Profile } from '../../db/types'
import { addDays, formatDateJa, mondayOf, todayKey } from '../../lib/dates'
import type { Proposal } from '../../coach/types'
import { addChatMessage, listChatMessages } from '../../repo/chat'
import { getPlanForDate } from '../../repo/plans'
import { saveProfile } from '../../repo/profile'
import { createRoutine } from '../../repo/routines'
import { assignRoutineToDate } from '../../repo/plans'
import { saveSettings } from '../../repo/settings'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { CoachError, type SendToCoach } from './client'
import { CoachPage } from './CoachPage'

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

const nextWeek = () => addDays(mondayOf(todayKey()), 7)
const skeleton = (): Skeleton => buildSkeleton({ profile: { ...profile, id: 'me', updatedAt: 0 }, weekStart: nextWeek(), weeksSinceDeload: 0 })

/** 骨組みどおりの来週のメニュー案 */
function goodReply(): CoachReply {
  const s = skeleton()
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

let online = true
beforeEach(async () => {
  await resetDb()
  online = true
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => vi.restoreAllMocks())

async function ready() {
  await saveProfile(profile)
  await saveSettings({ coachPasscode: 'pass' })
}

const open = (send: SendToCoach) => renderPage('/coach', '/coach', <CoachPage send={send} />)

describe('CoachPage', () => {
  it('プロフィールがなければ聞き取りへ案内する（戻るボタンはない）', async () => {
    await saveSettings({ coachPasscode: 'pass' })
    open(vi.fn())
    expect(await screen.findByRole('link', { name: 'プロフィールを入力する' })).toHaveAttribute('href', '/coach/profile')
    expect(screen.queryByRole('button', { name: '戻る' })).toBeNull()
    expect(screen.getByRole('button', { name: '来週のメニューを作って' })).toBeDisabled()
  })

  it('合言葉が未設定なら設定へ案内する', async () => {
    await saveProfile(profile)
    open(vi.fn())
    expect(await screen.findByRole('link', { name: '設定を開く' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('button', { name: '来週のメニューを作って' })).toBeDisabled()
  })

  it('来週のメニューを頼む → 案のカード → 反映すると予定に入る', async () => {
    await ready()
    const send = vi.fn<SendToCoach>(async () => goodReply())
    open(send)
    await userEvent.click(await screen.findByRole('button', { name: '来週のメニューを作って' }))
    expect(await screen.findByText(/来週のメニューです/)).toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].messages.at(-1)?.text).toBe('来週のメニューを作って')

    const card = await screen.findByRole('region', { name: 'メニュー案' })
    expect(within(card).getAllByText('上半身・下半身').length).toBeGreaterThan(0)
    const first = skeleton().days[0]
    expect(within(card).getByText(formatDateJa(first.date))).toBeInTheDocument()
    expect((await within(card).findAllByText('ベンチプレス')).length).toBeGreaterThan(0)
    expect(within(card).getAllByText(/100kg/).length).toBeGreaterThan(0)
    expect(within(card).getByText('前の週と同じ種目を続けます')).toBeInTheDocument()

    await userEvent.click(within(card).getByRole('button', { name: '反映する' }))
    expect(await within(card).findByText('反映済み')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'カレンダーで見る' })).toBeInTheDocument()
    const plan = await getPlanForDate(first.date)
    expect(plan).toMatchObject({ source: 'ai', title: first.title })
  })

  it('すでに予定がある日は、日付を示して確認してから置き換える', async () => {
    await ready()
    const first = skeleton().days[0]
    const routine = await createRoutine({ name: '胸の日', exercises: [] })
    await assignRoutineToDate(routine.id, first.date)
    open(vi.fn<SendToCoach>(async () => goodReply()))
    await userEvent.click(await screen.findByRole('button', { name: '来週のメニューを作って' }))
    const card = await screen.findByRole('region', { name: 'メニュー案' })
    await userEvent.click(within(card).getByRole('button', { name: '反映する' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('listitem')).toHaveTextContent(`${formatDateJa(first.date)}：胸の日`)
    expect((await getPlanForDate(first.date))?.title).toBe('胸の日')
    await userEvent.click(within(dialog).getByRole('button', { name: '置き換えて反映する' }))
    await waitFor(async () => expect((await getPlanForDate(first.date))?.source).toBe('ai'))
    expect(await within(card).findByText('反映済み')).toBeInTheDocument()
  })

  it('すべて過ぎた日の案は「反映する」を押せず、理由を出す', async () => {
    await ready()
    const past = addDays(todayKey(), -2)
    const proposal: Proposal = {
      split: 'upper_lower', reasons: '', issues: [], muscleSets: {},
      days: [{ date: past, title: '上半身', exercises: [{ slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 8, repRange: [6, 10], restSec: 150 }] }],
    }
    await addChatMessage({ role: 'coach', text: '古い案', proposal })
    open(vi.fn())
    const card = await screen.findByRole('region', { name: 'メニュー案' })
    expect(within(card).getByRole('button', { name: '反映する' })).toBeDisabled()
    expect(within(card).getByText(/すべて過ぎた日/)).toBeInTheDocument()
  })

  it('一部が過ぎた日の案は、今日以降の日だけ反映すると知らせる', async () => {
    await ready()
    const today = todayKey()
    const ex = { slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 8, repRange: [6, 10] as [number, number], restSec: 150 }
    const proposal: Proposal = {
      split: 'upper_lower', reasons: '', issues: [], muscleSets: {},
      days: [{ date: addDays(today, -1), title: '上半身', exercises: [ex] }, { date: today, title: '上半身', exercises: [ex] }],
    }
    await addChatMessage({ role: 'coach', text: '案', proposal })
    open(vi.fn())
    const card = await screen.findByRole('region', { name: 'メニュー案' })
    const pastLabel = formatDateJa(addDays(today, -1))
    expect(within(card).getByText((t) => t.includes(pastLabel) && t.includes('反映しません'))).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: '反映する' }))
    expect(await within(card).findByText('反映済み')).toBeInTheDocument()
    expect(await getPlanForDate(addDays(today, -1))).toBeUndefined()
    expect((await getPlanForDate(today))?.source).toBe('ai')
  })

  it('失敗したら理由を出し、「もう一度送る」で送り直せる', async () => {
    await ready()
    const send = vi.fn<SendToCoach>()
      .mockRejectedValueOnce(new CoachError('rate_limited'))
      .mockResolvedValueOnce({ message: 'フォームのコツです' })
    open(send)
    const input = await screen.findByRole('textbox', { name: 'メッセージ' })
    await userEvent.type(input, 'ベンチのコツは？')
    await userEvent.click(screen.getByRole('button', { name: '送信' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('今日は上限に達しました')
    // 送った内容は消えない
    expect(screen.getAllByText('ベンチのコツは？').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: 'もう一度送る' }))
    expect(await screen.findByText('フォームのコツです')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(send).toHaveBeenCalledTimes(2)
    expect((await listChatMessages()).map((m) => m.role)).toEqual(['user', 'coach'])
    expect(input).toHaveValue('')
  })

  it('合言葉が違うときは設定へ案内する', async () => {
    await ready()
    open(vi.fn<SendToCoach>(async () => { throw new CoachError('unauthorized') }))
    await userEvent.click(await screen.findByRole('button', { name: '今週を見直して' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('合言葉')
    expect(within(alert).getByRole('link', { name: '設定を開く' })).toHaveAttribute('href', '/settings')
  })

  it('送信中は「考え中…」を出し、送信できない', async () => {
    await ready()
    let resolve!: (r: CoachReply) => void
    const send = vi.fn<SendToCoach>(() => new Promise((r) => { resolve = r }))
    open(send)
    await userEvent.click(await screen.findByRole('button', { name: '今日できなかった' }))
    expect(await screen.findByText('考え中…')).toBeInTheDocument()
    await waitFor(() => expect(send).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: '今週を見直して' })).toBeDisabled()
    await act(async () => resolve({ message: '了解です' }))
    expect(await screen.findByText('了解です')).toBeInTheDocument()
    expect(screen.queryByText('考え中…')).toBeNull()
  })

  it('オフラインなら送信できず、理由を出す', async () => {
    await ready()
    online = false
    open(vi.fn())
    expect(await screen.findByText(/オフラインのため送信できません/)).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'メッセージ' }), 'こんにちは')
    expect(screen.getByRole('button', { name: '送信' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '来週のメニューを作って' })).toBeDisabled()
    online = true
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(screen.getByRole('button', { name: '送信' })).toBeEnabled()
  })

  it('空のメッセージは送れない', async () => {
    await ready()
    open(vi.fn())
    expect(await screen.findByRole('button', { name: '送信' })).toBeDisabled()
  })
})


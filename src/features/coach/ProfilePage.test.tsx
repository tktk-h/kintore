import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '../../test/user'
import { beforeEach, describe, expect, it } from 'vitest'
import { getProfile, saveProfile } from '../../repo/profile'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { ProfilePage } from './ProfilePage'

beforeEach(resetDb)

const open = () => renderPage('/coach/profile', '/coach/profile', <ProfilePage />)
// 役割での検索は重いので、グループの中を文字で探す
const group = (name: string) => screen.getByLabelText(name)
const chip = (g: string, name: string) => within(group(g)).getByText(name)

describe('ProfilePage', () => {
  it('聞き取りの内容を保存してAIコーチへ戻る', async () => {
    open()
    await userEvent.click(await screen.findByText('筋力アップ'))
    await userEvent.click(chip('経験', '1〜3年'))
    await userEvent.click(screen.getByLabelText('週の回数を増やす'))
    await userEvent.click(chip('行ける曜日', '月'))
    await userEvent.click(chip('行ける曜日', '木'))
    await userEvent.click(chip('行ける曜日', '日'))
    await userEvent.click(chip('使える器具', 'ジムのフリーウェイト'))
    await userEvent.click(chip('使える器具', 'ジムのマシン'))
    await userEvent.type(screen.getByLabelText('ケガや痛む所'), '右肩')
    await userEvent.click(screen.getByText('保存'))

    expect(await screen.findByTestId('current-path')).toHaveTextContent('/coach')
    expect(await getProfile()).toMatchObject({
      goal: 'strength', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60, weekdays: [0, 1, 4],
      equipment: ['gym_free', 'gym_machine'], injuries: '右肩', baselines: [],
    })
  })

  it('今の重量は「重量×回数」の両方を入れた種目だけ保存する', async () => {
    await saveProfile({
      goal: 'hypertrophy', experience: 'under_1y', daysPerWeek: 3, minutesPerSession: 45, weekdays: [1, 3, 5],
      equipment: ['gym_free'], injuries: '', baselines: [],
    })
    open()
    await userEvent.type(await screen.findByRole('spinbutton', { name: 'ベンチプレスの重量' }), '80')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'ベンチプレスの回数' }), '5')
    // 重量だけの種目は保存しない
    await userEvent.type(screen.getByRole('spinbutton', { name: 'スクワットの重量' }), '100')
    await userEvent.click(screen.getByText('保存'))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/coach')
    expect((await getProfile())?.baselines).toEqual([{ exerciseId: 'ex-bench-press', weight: 80, reps: 5 }])
  })

  it('目標・経験・曜日・器具が足りなければ保存せずに知らせる', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('目標')
    expect(await getProfile()).toBeUndefined()
    expect(screen.queryByTestId('current-path')).toBeNull()
  })

  it('保存済みの内容を表示して編集できる（チャットで変えた分割法は残す）', async () => {
    await saveProfile({
      goal: 'hypertrophy', experience: 'under_1y', daysPerWeek: 3, minutesPerSession: 45, weekdays: [1, 3, 5],
      equipment: ['home_dumbbell'], injuries: '', baselines: [{ exerciseId: 'ex-deadlift', weight: 100, reps: 3 }], preferredSplit: 'full_body',
    })
    open()
    expect(within(await screen.findByRole('group', { name: '目標' })).getByRole('button', { name: '筋肥大' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(group('行ける曜日')).getByRole('button', { name: '水' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1回の時間 45分' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'デッドリフトの重量' })).toHaveValue(100)
    await userEvent.click(chip('行ける曜日', '水'))
    await userEvent.click(screen.getByText('保存'))
    await waitFor(async () => expect((await getProfile())?.weekdays).toEqual([1, 5]))
    expect((await getProfile())?.preferredSplit).toBe('full_body')
  })

  it('分割法を選べる（自動なら希望なし）', async () => {
    await saveProfile({
      goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 3, minutesPerSession: 60, weekdays: [1, 3, 5],
      equipment: ['gym_free'], injuries: '', baselines: [],
    })
    open()
    expect(within(await screen.findByRole('group', { name: '分割法' })).getByRole('button', { name: '自動（おすすめ）' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip('分割法', 'PPL'))
    await userEvent.click(screen.getByText('保存'))
    await waitFor(async () => expect((await getProfile())?.preferredSplit).toBe('ppl'))
  })

  it('分割法を自動に戻すと希望を消す', async () => {
    await saveProfile({
      goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 3, minutesPerSession: 60, weekdays: [1, 3, 5],
      equipment: ['gym_free'], injuries: '', baselines: [], preferredSplit: 'ppl',
    })
    open()
    await userEvent.click(await screen.findByText('自動（おすすめ）'))
    await userEvent.click(screen.getByText('保存'))
    await waitFor(async () => expect((await getProfile())?.preferredSplit).toBeUndefined())
  })

  it('選んだ分割法が今の条件で組めないときは知らせる', async () => {
    await saveProfile({
      goal: 'hypertrophy', experience: 'none', daysPerWeek: 3, minutesPerSession: 60, weekdays: [1, 3, 5],
      equipment: ['gym_free'], injuries: '', baselines: [],
    })
    open()
    await userEvent.click(await screen.findByText('PPL'))
    expect(screen.getByText(/全身法で組みます/)).toBeInTheDocument()
  })

  it('戻るボタンがある', async () => {
    open()
    // 読み込み中の画面の「戻る」は読み込み後に作り直されるので、そのときどきの画面で確かめる
    await waitFor(() => expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument())
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { getProfile, saveProfile } from '../../repo/profile'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { ProfilePage } from './ProfilePage'

beforeEach(resetDb)

const open = () => renderPage('/coach/profile', '/coach/profile', <ProfilePage />)
const group = (name: string) => screen.getByRole('group', { name })

describe('ProfilePage', () => {
  it('聞き取りの内容を保存してAIコーチへ戻る', async () => {
    open()
    await userEvent.click(within(await screen.findByRole('group', { name: '目標' })).getByRole('button', { name: '筋力アップ' }))
    await userEvent.click(within(group('経験')).getByRole('button', { name: '1〜3年' }))
    await userEvent.click(screen.getByRole('button', { name: '週の回数を増やす' }))
    await userEvent.click(within(group('行ける曜日')).getByRole('button', { name: '月' }))
    await userEvent.click(within(group('行ける曜日')).getByRole('button', { name: '木' }))
    await userEvent.click(within(group('行ける曜日')).getByRole('button', { name: '日' }))
    await userEvent.click(within(group('使える器具')).getByRole('button', { name: 'ジムのフリーウェイト' }))
    await userEvent.click(within(group('使える器具')).getByRole('button', { name: 'ジムのマシン' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'ケガや痛む所' }), '右肩')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'ベンチプレスの重量' }), '80')
    await userEvent.type(screen.getByRole('spinbutton', { name: 'ベンチプレスの回数' }), '5')
    // 重量だけの種目は保存しない
    await userEvent.type(screen.getByRole('spinbutton', { name: 'スクワットの重量' }), '100')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByTestId('current-path')).toHaveTextContent('/coach')
    const p = await getProfile()
    expect(p).toMatchObject({
      goal: 'strength', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60, weekdays: [0, 1, 4],
      equipment: ['gym_free', 'gym_machine'], injuries: '右肩', baselines: [{ exerciseId: 'ex-bench-press', weight: 80, reps: 5 }],
    })
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
    await userEvent.click(within(group('行ける曜日')).getByRole('button', { name: '水' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(async () => expect((await getProfile())?.weekdays).toEqual([1, 5]))
    expect((await getProfile())?.preferredSplit).toBe('full_body')
  })

  it('戻るボタンがある', async () => {
    open()
    expect(await screen.findByRole('button', { name: '戻る' })).toBeInTheDocument()
  })
})

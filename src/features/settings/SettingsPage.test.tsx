import { screen, waitFor } from '@testing-library/react'
import userEvent from '../../test/user'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportBackup } from '../../lib/backup'
import { addChatMessage, listChatMessages } from '../../repo/chat'
import { createRoutine, listRoutines } from '../../repo/routines'
import { getSettings } from '../../repo/settings'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { SettingsPage } from './SettingsPage'

beforeEach(resetDb)

const open = () => renderPage('/settings', '/settings', <SettingsPage />)

describe('SettingsPage', () => {
  it('重量の刻み幅を変えられる', async () => {
    open()
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '重量の刻み幅' }), '1.25')
    await waitFor(async () => expect((await getSettings()).weightStep).toBe(1.25))
  })

  it('ダンベルの刻み幅を変えられる（既定は1kg、0.5/1/2/2.5kg から選ぶ）', async () => {
    open()
    const select = await screen.findByRole('combobox', { name: 'ダンベルの刻み幅' })
    await waitFor(() => expect(select).toHaveValue('1'))
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(['0.5', '1', '2', '2.5'])
    await userEvent.selectOptions(select, '2')
    await waitFor(async () => expect((await getSettings()).dumbbellStep).toBe(2))
  })

  it('確認してからバックアップを読み込む', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    const text = JSON.stringify(await exportBackup())
    await resetDb()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    open()
    const file = new File([text], 'backup.json', { type: 'application/json' })
    await userEvent.upload(await screen.findByLabelText('バックアップを読み込む'), file)
    await waitFor(async () => expect((await listRoutines()).map((r) => r.name)).toEqual(['胸の日']))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('アプリのバージョンと更新日時を出す', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'アプリについて' })).toBeInTheDocument()
    expect(screen.getByText('バージョン 0.2.0')).toBeInTheDocument()
    expect(screen.getByText(/^更新 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('壊れたファイルは読み込まずに知らせる', async () => {
    open()
    const file = new File(['broken'], 'backup.json', { type: 'application/json' })
    await userEvent.upload(await screen.findByLabelText('バックアップを読み込む'), file)
    expect(await screen.findByRole('alert')).toHaveTextContent('バックアップファイルを読み込めませんでした')
  })
})

describe('SettingsPage のAIコーチ', () => {
  it('合言葉を保存すると「設定済み」になる', async () => {
    open()
    const input = await screen.findByLabelText('合言葉')
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.queryByText('設定済み')).toBeNull()
    await userEvent.type(input, ' himitsu ')
    await userEvent.click(screen.getByRole('button', { name: '合言葉を保存' }))
    await waitFor(async () => expect((await getSettings()).coachPasscode).toBe('himitsu'))
    expect(await screen.findByText('設定済み')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('プロフィールの編集へ移れる', async () => {
    open()
    expect(await screen.findByRole('link', { name: 'プロフィールを編集' })).toHaveAttribute('href', '/coach/profile')
  })

  it('チャット履歴は確認してから消す', async () => {
    await addChatMessage({ role: 'user', text: 'こんにちは' })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'チャット履歴を消す' }))
    expect(confirm).toHaveBeenCalled()
    expect(await listChatMessages()).toHaveLength(1)
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'チャット履歴を消す' }))
    await waitFor(async () => expect(await listChatMessages()).toHaveLength(0))
    confirm.mockRestore()
  })
})

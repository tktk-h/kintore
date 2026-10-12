import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportBackup } from '../../lib/backup'
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

  it('壊れたファイルは読み込まずに知らせる', async () => {
    open()
    const file = new File(['broken'], 'backup.json', { type: 'application/json' })
    await userEvent.upload(await screen.findByLabelText('バックアップを読み込む'), file)
    expect(await screen.findByRole('alert')).toHaveTextContent('バックアップファイルを読み込めませんでした')
  })
})

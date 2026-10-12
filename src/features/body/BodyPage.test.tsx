import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { getBodyLog, saveBodyLog } from '../../repo/body'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { BodyPage } from './BodyPage'

beforeEach(resetDb)

const open = (date: string) => renderPage('/body', `/body?date=${date}`, <BodyPage />)

describe('BodyPage', () => {
  it('前回の値が最初から入っていて、＋で調整して保存できる', async () => {
    await saveBodyLog('2026-10-11', { weightKg: 70, bodyFatPct: 15 })
    open('2026-10-12')
    expect(await screen.findByRole('button', { name: '体重 70kg' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '体重を増やす' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(async () => expect(await getBodyLog('2026-10-12')).toMatchObject({ weightKg: 70.1, bodyFatPct: 15 }))
  })

  it('体脂肪率の記録がなければ、追加ボタンを押すまで保存しない', async () => {
    open('2026-10-12')
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))
    await waitFor(async () => expect(await getBodyLog('2026-10-12')).toBeDefined())
    expect((await getBodyLog('2026-10-12'))?.bodyFatPct).toBeUndefined()
  })
})

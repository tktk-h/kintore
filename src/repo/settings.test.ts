import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { resetDb } from '../test/db'
import { getSettings, saveSettings } from './settings'

beforeEach(resetDb)

describe('settings', () => {
  it('未保存なら初期値', async () => {
    expect(await getSettings()).toEqual({ id: 'app', weightStep: 2.5, repStep: 1, dumbbellStep: 1 })
  })
  it('一部だけ変更できる', async () => {
    await saveSettings({ weightStep: 1.25 })
    expect(await getSettings()).toEqual({ id: 'app', weightStep: 1.25, repStep: 1, dumbbellStep: 1 })
    await saveSettings({ dumbbellStep: 2 })
    expect(await getSettings()).toEqual({ id: 'app', weightStep: 1.25, repStep: 1, dumbbellStep: 2 })
  })
  it('ダンベルの刻み幅がない古い設定は、既定の1kgで補う', async () => {
    await db.settings.put({ id: 'app', weightStep: 5, repStep: 1 })
    expect(await getSettings()).toEqual({ id: 'app', weightStep: 5, repStep: 1, dumbbellStep: 1 })
  })
})

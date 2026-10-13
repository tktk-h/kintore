import { beforeEach, describe, expect, it } from 'vitest'
import type { Proposal } from '../coach/types'
import { resetDb } from '../test/db'
import { addChatMessage, clearChat, listChatMessages, markProposalApplied } from './chat'
import { db } from '../db/db'

beforeEach(resetDb)

const proposal: Proposal = {
  split: 'upper_lower',
  days: [{ date: '2026-10-19', title: '上半身', exercises: [] }],
  reasons: '理由',
  issues: [],
  muscleSets: { chest: 10 },
}

describe('chat', () => {
  it('追加した順（createdAt 昇順）に並ぶ', async () => {
    await addChatMessage({ role: 'user', text: '1' })
    await addChatMessage({ role: 'coach', text: '2', proposal })
    await addChatMessage({ role: 'user', text: '3' })
    const list = await listChatMessages()
    expect(list.map((m) => m.text)).toEqual(['1', '2', '3'])
    expect(list[1]).toMatchObject({ role: 'coach', proposal })
  })

  it('削除済みは出さない', async () => {
    const m = await addChatMessage({ role: 'user', text: '消す' })
    await db.chatMessages.update(m.id, { deleted: true })
    await addChatMessage({ role: 'user', text: '残る' })
    expect((await listChatMessages()).map((x) => x.text)).toEqual(['残る'])
  })

  it('メニュー案を反映済みにできる', async () => {
    const m = await addChatMessage({ role: 'coach', text: '案', proposal })
    expect(m.appliedAt).toBeUndefined()
    await markProposalApplied(m.id)
    const [saved] = await listChatMessages()
    expect(saved.appliedAt).toBeTypeOf('number')
  })

  it('チャットを消すと論理削除される', async () => {
    await addChatMessage({ role: 'user', text: 'a' })
    await addChatMessage({ role: 'coach', text: 'b' })
    await clearChat()
    expect(await listChatMessages()).toEqual([])
    const raw = await db.chatMessages.toArray()
    expect(raw).toHaveLength(2)
    expect(raw.every((m) => m.deleted)).toBe(true)
  })
})

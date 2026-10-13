import { db } from '../db/db'
import type { ChatMessage } from '../db/types'
import { newRecord } from '../lib/records'

export type ChatInput = Pick<ChatMessage, 'role' | 'text' | 'proposal'>

/** 古い順（createdAt 昇順）。削除済みは除く */
export async function listChatMessages(): Promise<ChatMessage[]> {
  return (await db.chatMessages.orderBy('createdAt').toArray()).filter((m) => !m.deleted)
}

export async function addChatMessage(input: ChatInput): Promise<ChatMessage> {
  return db.transaction('rw', db.chatMessages, async () => {
    // 同じミリ秒に続けて追加しても順番が入れ替わらないよう、直前より必ず後の時刻にする
    const last = await db.chatMessages.orderBy('createdAt').last()
    const now = Math.max(Date.now(), (last?.createdAt ?? 0) + 1)
    const fields = input.proposal === undefined ? { role: input.role, text: input.text } : input
    const m = newRecord<ChatMessage>(fields, now)
    await db.chatMessages.add(m)
    return m
  })
}

export async function markProposalApplied(id: string): Promise<void> {
  const now = Date.now()
  await db.chatMessages.update(id, { appliedAt: now, updatedAt: now })
}

/** チャットをすべて消す（論理削除） */
export async function clearChat(): Promise<void> {
  const now = Date.now()
  await db.chatMessages.filter((m) => !m.deleted).modify({ deleted: true, updatedAt: now })
}

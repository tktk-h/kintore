import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Proposal } from '../../coach/types'
import { addDays, todayKey } from '../../lib/dates'
import { addChatMessage } from '../../repo/chat'
import { getPlanForDate } from '../../repo/plans'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import userEvent from '../../test/user'
import { ProposalPage } from './ProposalPage'

const day = addDays(todayKey(), 3)
const proposal = (reps: number): Proposal => ({
  split: 'upper_lower', reasons: '', issues: [], muscleSets: {},
  days: [{ date: day, title: '上半身', exercises: [{ slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps, repRange: [6, 12], restSec: 150, weight: 60 }] }],
})

beforeEach(resetDb)

/** 案を2つ（2つ目は回数だけ違う）チャットに入れておく */
async function twoProposals() {
  await addChatMessage({ role: 'user', text: '来週のメニューを作って' })
  const first = await addChatMessage({ role: 'coach', text: '案です', proposal: proposal(8) })
  await addChatMessage({ role: 'user', text: '回数を増やして' })
  const second = await addChatMessage({ role: 'coach', text: '直しました', proposal: proposal(10) })
  return { first, second }
}

const open = (id: string) => renderPage('/coach/proposal/:id', `/coach/proposal/${id}`, <ProposalPage />)

describe('ProposalPage', () => {
  it('何番目の案かを出し、矢印でほかの案に切り替える', async () => {
    const { second } = await twoProposals()
    open(second.id)
    const nav = await screen.findByRole('navigation', { name: '案の切り替え' })
    expect(nav).toHaveTextContent('案2 / 2')
    expect(within(nav).queryByRole('link', { name: '次の案' })).toBeNull()
    await userEvent.click(within(nav).getByRole('link', { name: '前の案' }))
    expect(await screen.findByRole('navigation', { name: '案の切り替え' })).toHaveTextContent('案1 / 2')
    expect(screen.queryByRole('link', { name: '前の案' })).toBeNull()
    expect(screen.getByRole('link', { name: '次の案' })).toBeInTheDocument()
  })

  it('戻るボタンがある', async () => {
    const { first } = await twoProposals()
    open(first.id)
    expect(await screen.findByRole('button', { name: '戻る' })).toBeInTheDocument()
  })

  it('「反映する」で予定に入る', async () => {
    const { second } = await twoProposals()
    open(second.id)
    const card = await screen.findByRole('region', { name: 'メニュー案' })
    await userEvent.click(within(card).getByRole('button', { name: '反映する' }))
    expect(await within(card).findByText('反映済み')).toBeInTheDocument()
    expect((await getPlanForDate(day))?.source).toBe('ai')
  })

  it('見つからない案なら、そう出す', async () => {
    await twoProposals()
    open('nope')
    expect(await screen.findByText('この案は見つかりませんでした。')).toBeInTheDocument()
  })
})

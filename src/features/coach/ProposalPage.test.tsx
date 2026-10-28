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

  describe('前の案との違い', () => {
    it('変わった回数をオレンジにして前の値を出し、上に説明を出す', async () => {
      const { second } = await twoProposals()
      open(second.id)
      expect(await screen.findByText('オレンジ＝案1から変わった所')).toBeInTheDocument()
      const row = await screen.findByRole('button', { name: /^ベンチプレス 10×3 前 8×3/ })
      expect(within(row).getByText('←8×3')).toBeInTheDocument()
      expect(within(row).getByText('10×3', { exact: false })).toHaveClass('is-changed')
    })

    it('案1には違いの説明を出さない', async () => {
      const { first } = await twoProposals()
      open(first.id)
      await screen.findByRole('region', { name: 'メニュー案' })
      expect(screen.queryByText(/から変わった所/)).toBeNull()
    })

    it('入れ替え・新しい種目に印を付け、外した種目と外した日を出す', async () => {
      const next = addDays(day, 1)
      await addChatMessage({ role: 'coach', text: '案です', proposal: { ...proposal(8), days: [
        { date: day, title: '上半身', exercises: [
          { slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 8, repRange: [6, 12], restSec: 150, weight: 60 },
          { slot: 'upper.2', exerciseId: 'ex-lat-pulldown', sets: 3, reps: 10, repRange: [8, 12], restSec: 120, weight: 45 },
        ] },
        { date: next, title: '下半身', exercises: [{ slot: 'lower.1', exerciseId: 'ex-squat', sets: 3, reps: 8, repRange: [6, 10], restSec: 150, weight: 70 }] },
      ] } })
      const m = await addChatMessage({ role: 'coach', text: '直しました', proposal: { ...proposal(8), days: [
        { date: day, title: '上半身', exercises: [
          { slot: 'upper.1', exerciseId: 'ex-dumbbell-shoulder-press', sets: 3, reps: 8, repRange: [6, 12], restSec: 150, weight: 16 },
          { slot: 'upper.3', exerciseId: 'ex-side-raise', sets: 3, reps: 12, repRange: [10, 15], restSec: 90, weight: 6 },
        ] },
      ] } })
      open(m.id)
      expect(await screen.findByRole('button', { name: /^ダンベルショルダープレス.*入れ替え（前 ベンチプレス）/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^サイドレイズ.*新/ })).toBeInTheDocument()
      const removed = screen.getByRole('list', { name: '外した種目' })
      expect(removed).toHaveTextContent('ラットプルダウン')
      const removedDays = screen.getByRole('list', { name: '外した日' })
      expect(removedDays).toHaveTextContent('スクワット')
    })

    it('対象の週が違えば、比べていないと出す', async () => {
      await addChatMessage({ role: 'coach', text: '案です', proposal: proposal(8) })
      const other = { ...proposal(8), days: proposal(8).days.map((d) => ({ ...d, date: addDays(day, 14) })) }
      const m = await addChatMessage({ role: 'coach', text: '再来週です', proposal: other })
      open(m.id)
      expect(await screen.findByText('前の案と対象の週が違うので比べていません')).toBeInTheDocument()
    })
  })

  it('見つからない案なら、そう出す', async () => {
    await twoProposals()
    open('nope')
    expect(await screen.findByText('この案は見つかりませんでした。')).toBeInTheDocument()
  })
})

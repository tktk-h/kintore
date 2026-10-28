import { ChevronRight, ListChecks } from 'lucide-react'
import { Link } from 'react-router'
import type { ProposalEntry } from './proposalList'

/** チャットの中の案の1行（設計書「1. チャット画面」）。押すと案の画面を開く */
export function ProposalLink({ entry, latest }: { entry: ProposalEntry; latest: boolean }) {
  const { message, no, diff } = entry
  const p = message.proposal!
  const applied = message.appliedAt !== undefined
  const detail = diff ? `変更 ${diff.count}か所` : `${p.days.length}日 · ${p.days.reduce((n, d) => n + d.exercises.length, 0)}種目`
  return (
    <Link className={`proposal-link ${latest && !applied ? 'is-current' : ''}`.trim()} to={`/coach/proposal/${message.id}`}>
      <ListChecks aria-hidden="true" />
      <span className="proposal-link-text">案{no} · {detail}</span>
      <span className="proposal-link-status">{applied ? '反映済み' : '未反映'}</span>
      <ChevronRight aria-hidden="true" />
    </Link>
  )
}

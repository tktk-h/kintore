import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../components/PageHeader'
import { formatDateShort } from '../../lib/dates'
import { listChatMessages } from '../../repo/chat'
import { ProposalCard } from './ProposalCard'
import { proposalEntries } from './proposalList'

/** メニュー案の画面（設計書「2. 案の画面」）。矢印でこのチャットのほかの案に切り替える */
export function ProposalPage() {
  const { id } = useParams()
  const messages = useLiveQuery(listChatMessages)
  if (!messages) return null
  const entries = proposalEntries(messages)
  const i = entries.findIndex((e) => e.message.id === id)
  const entry = entries[i]
  const prev = entries[i - 1]
  const next = entries[i + 1]
  return (
    <div className="page proposal-page">
      <PageHeader title="メニュー案" backTo="/coach" />
      {!entry ? (
        <p className="muted">この案は見つかりませんでした。</p>
      ) : (
        <>
          <nav className="proposal-switch" aria-label="案の切り替え">
            {prev ? (
              <Link className="icon-btn" to={`/coach/proposal/${prev.message.id}`} replace aria-label="前の案">
                <ChevronLeft aria-hidden="true" />
              </Link>
            ) : (
              <span className="icon-btn is-disabled" aria-hidden="true"><ChevronLeft /></span>
            )}
            <span className="num">案{entry.no} / {entries.length} · {dateRange(entry.message.proposal!.days.map((d) => d.date))}</span>
            {next ? (
              <Link className="icon-btn" to={`/coach/proposal/${next.message.id}`} replace aria-label="次の案">
                <ChevronRight aria-hidden="true" />
              </Link>
            ) : (
              <span className="icon-btn is-disabled" aria-hidden="true"><ChevronRight /></span>
            )}
          </nav>
          <ProposalCard key={entry.message.id} message={entry.message} />
        </>
      )}
    </div>
  )
}

/** 例：「11/2〜11/8」 */
function dateRange(dates: string[]): string {
  const s = [...dates].sort()
  if (s.length === 0) return ''
  const [first, last] = [s[0], s[s.length - 1]]
  return first === last ? formatDateShort(first) : `${formatDateShort(first)}〜${formatDateShort(last)}`
}

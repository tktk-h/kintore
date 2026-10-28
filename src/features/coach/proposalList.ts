import { diffProposals, type ProposalDiff } from '../../coach/diff'
import type { ChatMessage } from '../../db/types'

export interface ProposalEntry {
  message: ChatMessage
  /** このチャットでの通し番号（古い順に1から） */
  no: number
  /** 1つ前の案との違い（案1・対象の週が違うときは undefined） */
  diff?: ProposalDiff
}

/** チャットのメッセージから案だけを古い順に取り出す */
export function proposalEntries(messages: ChatMessage[]): ProposalEntry[] {
  const withProposal = messages.filter((m) => m.role === 'coach' && m.proposal)
  return withProposal.map((message, i) => ({
    message,
    no: i + 1,
    diff: i > 0 ? diffProposals(withProposal[i - 1].proposal!, message.proposal!) : undefined,
  }))
}

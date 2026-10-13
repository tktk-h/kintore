import { X } from 'lucide-react'
import type { Rating } from '../../db/types'

const OPTIONS: { value: Rating; label: string }[] = [
  { value: 1, label: '楽' },
  { value: 2, label: '' },
  { value: 3, label: 'ちょうどいい' },
  { value: 4, label: '' },
  { value: 5, label: '限界' },
]

interface Props {
  onPick: (effort: Rating) => void
  onDismiss: () => void
}

/** 種目の最後のセットのあとに出す「きつさは？」（1回タップで保存。答えなくても先に進める） */
export function EffortPrompt({ onPick, onDismiss }: Props) {
  return (
    <div className="effort-prompt" role="group" aria-label="きつさは？">
      <div className="effort-head">
        <span>きつさは？</span>
        <button type="button" className="icon-btn" aria-label="きつさの入力を閉じる" onClick={onDismiss}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="effort-options">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" aria-label={`きつさ ${o.value}`} onClick={() => onPick(o.value)}>
            <strong>{o.value}</strong>
            {o.label && <small>{o.label}</small>}
          </button>
        ))}
      </div>
    </div>
  )
}

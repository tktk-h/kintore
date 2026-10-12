import type { Rating } from '../db/types'

export const FACES = ['😫', '😕', '😐', '🙂', '😄']
export const NUMBERS = ['1', '2', '3', '4', '5']

interface Props {
  label: string
  symbols: string[]
  value: Rating | undefined
  onChange: (value: Rating | undefined) => void
}

/** 5段階の選択。選択中をもう一度押すと解除 */
export function RatingPicker({ label, symbols, value, onChange }: Props) {
  return (
    <div className="rating" role="group" aria-label={label}>
      {symbols.map((symbol, i) => {
        const r = (i + 1) as Rating
        return (
          <button
            key={r}
            type="button"
            className={value === r ? 'selected' : ''}
            aria-pressed={value === r}
            aria-label={`${label} ${r}`}
            onClick={() => onChange(value === r ? undefined : r)}
          >
            {symbol}
          </button>
        )
      })}
    </div>
  )
}

import { useState } from 'react'

interface Props {
  label: string
  value: number
  step: number
  min?: number
  unit?: string
  onChange: (value: number) => void
}

const round = (v: number) => Math.round(v * 100) / 100

export function Stepper({ label, value, step, min = 0, unit, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="stepper">
      <button type="button" aria-label={`${label}を減らす`} onClick={() => onChange(Math.max(min, round(value - step)))}>
        −
      </button>
      {editing ? (
        <input
          type="number"
          inputMode="decimal"
          aria-label={label}
          defaultValue={value}
          autoFocus
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (e.target.value !== '' && !Number.isNaN(v)) onChange(Math.max(min, round(v)))
            setEditing(false)
          }}
        />
      ) : (
        <button type="button" className="stepper-value" aria-label={`${label} ${value}${unit ?? ''}`} onClick={() => setEditing(true)}>
          {value}
          {unit && <small>{unit}</small>}
        </button>
      )}
      <button type="button" aria-label={`${label}を増やす`} onClick={() => onChange(round(value + step))}>
        ＋
      </button>
    </div>
  )
}

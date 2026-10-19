import type { ReactNode } from 'react'

export interface ExerciseRowProps {
  /** 種目名（長ければ省略して …） */
  name: string
  /** 右側の量。例：「10×3」「3セット」 */
  volume: string
  /** 右端の重さ。例：「60kg」。自重・時間の種目は省略 */
  weight?: string
  /** 先頭の小さな色の点（主な部位の色） */
  color?: string
  /** 読み上げ名（省略すると名前・量・重さ） */
  ariaLabel?: string
  onClick: () => void
}

/** 1行で見渡せる種目の行（押すと詳細）。ExerciseRows の中に並べる */
export function ExerciseRow({ name, volume, weight, color, ariaLabel, onClick }: ExerciseRowProps) {
  return (
    <li className="ex-row-item">
      <button
        type="button"
        className="ex-row"
        aria-label={ariaLabel ?? [name, volume, weight].filter(Boolean).join(' ')}
        onClick={onClick}
      >
        {color && <i className="ex-row-dot" style={{ background: color }} aria-hidden="true" />}
        <span className="ex-row-name">{name}</span>
        <span className="ex-row-volume num">{volume}</span>
        {weight && <span className="ex-row-weight num">{weight}</span>}
      </button>
    </li>
  )
}

/** 細い線で区切った種目の行のリスト */
export function ExerciseRows({ children }: { children: ReactNode }) {
  return <ul className="ex-rows">{children}</ul>
}

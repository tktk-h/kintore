import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BODY_PART_LABELS, BODY_PARTS, type BodyPart, type Exercise } from '../../db/types'
import { filterExercises, listExercises } from '../../repo/exercises'

/** 検索欄と部位の絞り込み。絞り込んだ結果は呼び出し側で表示する */
export function useExerciseFilter() {
  const all = useLiveQuery(listExercises)
  const [query, setQuery] = useState('')
  const [bodyPart, setBodyPart] = useState<BodyPart | undefined>()
  const results: Exercise[] = all ? filterExercises(all, query, bodyPart) : []
  const controls = (
    <div className="stack">
      <input type="search" aria-label="種目を検索" placeholder="種目名で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        <button type="button" className={`chip ${bodyPart === undefined ? 'selected' : ''}`} onClick={() => setBodyPart(undefined)}>
          すべて
        </button>
        {BODY_PARTS.map((p) => (
          <button key={p} type="button" className={`chip ${bodyPart === p ? 'selected' : ''}`} onClick={() => setBodyPart(p)}>
            {BODY_PART_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  )
  return { results, controls, loading: all === undefined }
}

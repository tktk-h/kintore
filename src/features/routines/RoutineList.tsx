import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '../../components/EmptyState'
import { listRoutines } from '../../repo/routines'

/** マイメニューの一覧（「メニュー」画面のタブの中身） */
export function RoutineList() {
  const routines = useLiveQuery(listRoutines)
  return (
    <>
      {routines?.length === 0 && (
        <EmptyState icon={ClipboardList}>
          <p>よくやる種目の組み合わせを保存しておくと、すぐにトレーニングを始められます。</p>
        </EmptyState>
      )}
      <ul className="list">
        {routines?.map((r) => (
          <li key={r.id}>
            <Link className="item" to={`/routines/${r.id}`}>
              {r.name}
              <span className="item-meta">
                {r.exercises.length}種目
                <ChevronRight aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

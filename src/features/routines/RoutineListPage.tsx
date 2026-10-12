import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ClipboardList, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '../../components/EmptyState'
import { listRoutines } from '../../repo/routines'

export function RoutineListPage() {
  const routines = useLiveQuery(listRoutines)
  return (
    <div className="page">
      <header className="page-header">
        <h1>マイメニュー</h1>
        <Link className="btn btn-primary btn-sm" to="/routines/new">
          <Plus aria-hidden="true" />
          新規
        </Link>
      </header>
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
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { listRoutines } from '../../repo/routines'

export function RoutineListPage() {
  const routines = useLiveQuery(listRoutines)
  return (
    <div className="page">
      <header className="page-header">
        <h1>マイメニュー</h1>
        <Link className="btn btn-primary" to="/routines/new">
          ＋ 新規
        </Link>
      </header>
      {routines?.length === 0 && <p className="muted">よくやる種目の組み合わせを保存しておくと、すぐにトレーニングを始められます。</p>}
      <ul className="list">
        {routines?.map((r) => (
          <li key={r.id}>
            <Link className="item" to={`/routines/${r.id}`}>
              {r.name}
              <span className="muted">{r.exercises.length}種目</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

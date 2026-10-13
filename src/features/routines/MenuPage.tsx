import { Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { ExerciseList } from '../exercises/ExerciseList'
import { RoutineList } from './RoutineList'

type Tab = 'routines' | 'exercises'

const TABS: { id: Tab; label: string }[] = [
  { id: 'routines', label: 'マイメニュー' },
  { id: 'exercises', label: '種目' },
]

/** 「メニュー」タブ：マイメニューと種目を上のタブで切り替える（/routines?tab=exercises） */
export function MenuPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'exercises' ? 'exercises' : 'routines'
  const select = (t: Tab) => setParams(t === 'routines' ? {} : { tab: t }, { replace: true })
  return (
    <div className="page">
      <header className="page-header">
        <h1>メニュー</h1>
        {tab === 'routines' ? (
          <Link className="btn btn-primary btn-sm" to="/routines/new">
            <Plus aria-hidden="true" />
            新規
          </Link>
        ) : (
          <Link className="btn btn-primary btn-sm" to="/exercises/new">
            <Plus aria-hidden="true" />
            追加
          </Link>
        )}
      </header>
      <div className="tabs" role="tablist" aria-label="メニューの切り替え">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`menu-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="menu-panel"
            className={tab === t.id ? 'selected' : ''}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="stack" role="tabpanel" id="menu-panel" aria-labelledby={`menu-tab-${tab}`}>
        {tab === 'routines' ? <RoutineList /> : <ExerciseList />}
      </div>
    </div>
  )
}

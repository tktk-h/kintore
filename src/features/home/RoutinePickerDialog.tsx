import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Dialog } from '../../components/Dialog'
import type { Routine } from '../../db/types'
import { listRoutines } from '../../repo/routines'

interface Props {
  onPick: (routine: Routine) => void
  onClose: () => void
}

export function RoutinePickerDialog({ onPick, onClose }: Props) {
  const routines = useLiveQuery(listRoutines)
  return (
    <Dialog title="マイメニューから選ぶ" onClose={onClose}>
      {routines?.length === 0 && (
        <p className="muted">
          まだマイメニューがありません。<Link to="/routines/new">作成する</Link>
        </p>
      )}
      <ul className="list">
        {routines?.map((r) => (
          <li key={r.id}>
            <button type="button" className="item" onClick={() => onPick(r)}>
              {r.name}
              <span className="muted">{r.exercises.length}種目</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router'
import { Dialog } from '../../components/Dialog'
import { EmptyState } from '../../components/EmptyState'
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
        <EmptyState icon={ClipboardList}>
          <p>
            まだマイメニューがありません。<Link to="/routines/new">作成する</Link>
          </p>
        </EmptyState>
      )}
      <ul className="list">
        {routines?.map((r) => (
          <li key={r.id}>
            <button type="button" className="item" onClick={() => onPick(r)}>
              {r.name}
              <span className="item-meta">
                {r.exercises.length}種目
                <ChevronRight aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

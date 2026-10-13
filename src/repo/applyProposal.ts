import { db } from '../db/db'
import type { PlannedExercise, PlannedWorkout, SetValues } from '../db/types'
import { newRecord } from '../lib/records'
import { defaultSets } from '../lib/setValues'
import { markProposalApplied } from './chat'

/**
 * チャットのメニュー案を予定メニューとして保存する（設計書「メニュー案カード」の「反映する」）。
 * - 各日を source 'ai' の予定にする。各種目に枠と目標回数の幅、セットは sets 個の { weight, reps }
 * - 軽めの週の案なら予定に deload の印をつける
 * - その日にすでに予定があれば置き換える（論理削除）
 * - 反映済みの印をつける。反映済みの案をもう一度反映しても何もしない
 * 保存した予定を返す（すでに反映済みなら空）。
 */
export async function applyProposal(messageId: string): Promise<PlannedWorkout[]> {
  return db.transaction('rw', [db.chatMessages, db.plannedWorkouts, db.exercises], async () => {
    const message = await db.chatMessages.get(messageId)
    if (!message || message.deleted || !message.proposal) throw new Error('メニュー案が見つかりません')
    if (message.appliedAt !== undefined) return []
    const proposal = message.proposal
    const now = Date.now()
    const ids = [...new Set(proposal.days.flatMap((d) => d.exercises.map((x) => x.exerciseId)))]
    const exercises = new Map((await db.exercises.bulkGet(ids)).filter((e) => e).map((e) => [e!.id, e!]))

    const saved: PlannedWorkout[] = []
    for (const day of proposal.days) {
      const existing = await db.plannedWorkouts.where('date').equals(day.date).toArray()
      for (const p of existing) {
        if (!p.deleted) await db.plannedWorkouts.update(p.id, { deleted: true, updatedAt: now })
      }
      const planned: PlannedExercise[] = day.exercises.flatMap((x) => {
        const ex = exercises.get(x.exerciseId)
        if (!ex) return []
        let values: SetValues
        if (ex.logType === 'time_distance') values = defaultSets(ex.logType, ex.bodyPart)[0]
        else values = x.weight !== undefined ? { weight: x.weight, reps: x.reps } : { reps: x.reps }
        return [{
          exerciseId: x.exerciseId,
          restSec: x.restSec,
          slot: x.slot,
          repRange: [x.repRange[0], x.repRange[1]] as [number, number],
          sets: Array.from({ length: x.sets }, () => ({ ...values })),
        }]
      })
      const plan = newRecord<PlannedWorkout>(
        { date: day.date, title: day.title, exercises: planned, source: 'ai', ...(proposal.deload ? { deload: true } : {}) },
        now,
      )
      await db.plannedWorkouts.add(plan)
      saved.push(plan)
    }
    await markProposalApplied(messageId)
    return saved
  })
}

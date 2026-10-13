import { db } from '../db/db'
import type { ProposalDay } from '../coach/types'
import type { PlannedExercise, PlannedWorkout, SetValues } from '../db/types'
import { todayKey } from '../lib/dates'
import { newRecord } from '../lib/records'
import { defaultSets } from '../lib/setValues'
import { markProposalApplied } from './chat'

/** すべて過ぎた日の案を反映しようとしたとき */
export const ALL_PAST_MESSAGE = 'すべて過ぎた日の案なので反映できません。新しい案を頼んでください。'

/** 案の日のうち今日以降のものを、同じ日付をまとめて日付順に返す */
export function applicableDays(days: ProposalDay[], today: string): ProposalDay[] {
  const byDate = new Map<string, ProposalDay>()
  for (const d of days) {
    if (d.date < today) continue
    const cur = byDate.get(d.date)
    if (!cur) byDate.set(d.date, { ...d, exercises: [...d.exercises] })
    else {
      cur.exercises.push(...d.exercises)
      if (d.title && !cur.title.split('・').includes(d.title)) cur.title = cur.title ? `${cur.title}・${d.title}` : d.title
      if (d.note) cur.note = cur.note ? `${cur.note}\n${d.note}` : d.note
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * チャットのメニュー案を予定メニューとして保存する（設計書「メニュー案カード」の「反映する」）。
 * - 各日を source 'ai' の予定にする。各種目に枠と目標回数の幅、セットは sets 個の { weight, reps }
 * - 軽めの週の案なら予定に deload の印をつける
 * - その日にすでに予定があれば置き換える（論理削除）
 * - 同じ日付が2回あれば1つの予定にまとめる（種目を落とさない）
 * - 過ぎた日（today より前）は反映しない。すべて過ぎた日なら何もせずにエラー
 * - 反映済みの印をつける。反映済みの案をもう一度反映しても何もしない
 * 保存した予定を返す（すでに反映済みなら空）。
 */
export async function applyProposal(messageId: string, today = todayKey()): Promise<PlannedWorkout[]> {
  return db.transaction('rw', [db.chatMessages, db.plannedWorkouts, db.exercises], async () => {
    const message = await db.chatMessages.get(messageId)
    if (!message || message.deleted || !message.proposal) throw new Error('メニュー案が見つかりません')
    if (message.appliedAt !== undefined) return []
    const proposal = message.proposal
    const days = applicableDays(proposal.days, today)
    if (days.length === 0) throw new Error(ALL_PAST_MESSAGE)
    const now = Date.now()
    const ids = [...new Set(days.flatMap((d) => d.exercises.map((x) => x.exerciseId)))]
    const exercises = new Map((await db.exercises.bulkGet(ids)).filter((e) => e).map((e) => [e!.id, e!]))

    const saved: PlannedWorkout[] = []
    for (const day of days) {
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

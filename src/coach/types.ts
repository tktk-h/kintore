import type { MovementPattern, Muscle } from '../db/types'

export type SplitType = 'full_body' | 'upper_lower' | 'ppl' | 'ul_ppl'
export type DayType = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs'
export interface SlotPlan {
  slot: string                    // 例：'upper.1'
  patterns: MovementPattern[]     // この枠に入れてよい動き
  sets: number
  repRange: [number, number]
  restSec: number
  compound: boolean
}
export interface DayPlan { date: string; dayType: DayType; title: string; slots: SlotPlan[] }
export interface Skeleton {
  split: SplitType
  weekStart: string               // 月曜の日付
  days: DayPlan[]
  weeklySetTarget: [number, number]   // 部位ごとの週のセット数の目標
  deload: boolean
  /** 日数を減らした・分割法を変えたなどの理由（チャットやAIに伝える） */
  notes: string[]
  /** 今週の見直しで、対象週にもう終えた日（48時間ルールで数える） */
  done?: { date: string; muscles: Muscle[] }[]
  /** もう終えた日の部位ごとのセット数（週のセット数に足す） */
  doneMuscleSets?: Partial<Record<Muscle, number>>
}
/** 対象週にもう終えたトレーニング1日分 */
export interface DoneDay {
  date: string
  /** 主に使った部位（有酸素を除く） */
  muscles: Muscle[]
  /** 部位ごとのセット数（主1・補助0.5） */
  muscleSets: Partial<Record<Muscle, number>>
}
export interface ProposalExercise { slot: string; exerciseId: string; sets: number; reps: number; repRange: [number, number]; restSec: number; weight?: number }
export interface ProposalDay { date: string; title: string; exercises: ProposalExercise[]; note?: string }
export interface Proposal {
  split: SplitType
  days: ProposalDay[]
  reasons: string
  issues: string[]
  muscleSets: Partial<Record<Muscle, number>>
  /** 軽めの週（骨組みから）。反映するとき予定に印をつける */
  deload?: boolean
}

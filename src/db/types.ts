export type BodyPart = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'abs' | 'cardio'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'
/**
 * weight_reps: 重量×回数
 * reps: 回数のみ（weight は加重ならプラス、補助ならマイナス）
 * time_distance: 時間・距離
 */
export type LogType = 'weight_reps' | 'reps' | 'time_distance'
export type Rating = 1 | 2 | 3 | 4 | 5

/** 同期できるように、すべての記録が持つ項目 */
export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export interface Exercise extends BaseRecord {
  name: string
  bodyPart: BodyPart
  equipment: Equipment
  logType: LogType
  defaultRestSec: number
  custom: boolean
}

export interface SetValues {
  weight?: number
  reps?: number
  durationSec?: number
  distanceKm?: number
}

export interface PlannedExercise {
  exerciseId: string
  restSec: number
  sets: SetValues[]
}

export interface Routine extends BaseRecord {
  name: string
  exercises: PlannedExercise[]
}

/** 1bで 'ai' を追加する */
export type PlanSource = 'routine' | 'manual'

export interface PlannedWorkout extends BaseRecord {
  date: string
  title: string
  exercises: PlannedExercise[]
  source: PlanSource
  routineId?: string
}

export interface Workout extends BaseRecord {
  date: string
  title?: string
  startedAt: number
  finishedAt?: number
  /** 一時停止した時刻。一時停止中だけある */
  pausedAt?: number
  /** これまでに一時停止していた時間の合計（ミリ秒） */
  pausedMs?: number
  condition?: Rating
  satisfaction?: Rating
  note?: string
  plannedWorkoutId?: string
}

export interface WorkoutExercise extends BaseRecord {
  workoutId: string
  exerciseId: string
  order: number
  restSec: number
  /** きつさ（5段階） */
  effort?: Rating
  note?: string
}

export interface SetRecord extends BaseRecord, SetValues {
  workoutId: string
  workoutExerciseId: string
  order: number
  done: boolean
  doneAt?: number
}

export interface BodyLog extends BaseRecord {
  date: string
  weightKg?: number
  bodyFatPct?: number
  /** 縮小した JPEG の data URL */
  photo?: string
}

export interface Settings {
  id: 'app'
  weightStep: number
  repStep: number
}

export const DEFAULT_SETTINGS: Settings = { id: 'app', weightStep: 2.5, repStep: 1 }

export const BODY_PARTS: BodyPart[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'abs', 'cardio']

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  abs: '腹',
  cardio: '有酸素',
}

export const BODY_PART_COLORS: Record<BodyPart, string> = {
  chest: '#ef4444',
  back: '#3b82f6',
  legs: '#22c55e',
  shoulders: '#f59e0b',
  arms: '#a855f7',
  abs: '#14b8a6',
  cardio: '#ec4899',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'バーベル',
  dumbbell: 'ダンベル',
  machine: 'マシン',
  cable: 'ケーブル',
  bodyweight: '自重',
  other: 'その他',
}

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  weight_reps: '重量×回数',
  reps: '回数のみ',
  time_distance: '時間・距離',
}

import Dexie, { type EntityTable } from 'dexie'
import { seedExercises } from './seedExercises'
import type {
  BodyLog,
  ChatMessage,
  Exercise,
  PlannedWorkout,
  Profile,
  Routine,
  SetRecord,
  Settings,
  Workout,
  WorkoutExercise,
} from './types'

/** version 1 の表（version 2 のアップグレードのテストでも使う） */
export const SCHEMA_V1 = {
  exercises: 'id, bodyPart, name',
  routines: 'id',
  plannedWorkouts: 'id, date',
  workouts: 'id, date, startedAt',
  workoutExercises: 'id, workoutId, exerciseId',
  sets: 'id, workoutId, workoutExerciseId',
  bodyLogs: 'id, date',
  settings: 'id',
}

export class KintoreDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  plannedWorkouts!: EntityTable<PlannedWorkout, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  workoutExercises!: EntityTable<WorkoutExercise, 'id'>
  sets!: EntityTable<SetRecord, 'id'>
  bodyLogs!: EntityTable<BodyLog, 'id'>
  settings!: EntityTable<Settings, 'id'>
  profile!: EntityTable<Profile, 'id'>
  chatMessages!: EntityTable<ChatMessage, 'id'>

  constructor() {
    super('kintore')
    this.version(1).stores(SCHEMA_V1)
    this.version(2)
      .stores({ ...SCHEMA_V1, profile: 'id', chatMessages: 'id, createdAt' })
      .upgrade(async (tx) => {
        // 既存の定番種目に、動きの種類・部位・複数関節の情報を書き足す（名前などは変えない）
        const seeds = new Map(seedExercises().map((e) => [e.id, e]))
        await tx
          .table<Exercise, string>('exercises')
          .toCollection()
          .modify((e) => {
            const seed = seeds.get(e.id)
            if (e.custom || !seed) return
            e.pattern = seed.pattern
            e.primary = seed.primary
            e.secondary = seed.secondary
            e.compound = seed.compound
          })
      })
    this.on('populate', (tx) => {
      void tx.table('exercises').bulkAdd(seedExercises())
    })
  }
}

export const db = new KintoreDB()

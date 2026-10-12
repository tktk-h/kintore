import Dexie, { type EntityTable } from 'dexie'
import { seedExercises } from './seedExercises'
import type {
  BodyLog,
  Exercise,
  PlannedWorkout,
  Routine,
  SetRecord,
  Settings,
  Workout,
  WorkoutExercise,
} from './types'

export class KintoreDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  plannedWorkouts!: EntityTable<PlannedWorkout, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  workoutExercises!: EntityTable<WorkoutExercise, 'id'>
  sets!: EntityTable<SetRecord, 'id'>
  bodyLogs!: EntityTable<BodyLog, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('kintore')
    this.version(1).stores({
      exercises: 'id, bodyPart, name',
      routines: 'id',
      plannedWorkouts: 'id, date',
      workouts: 'id, date, startedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      bodyLogs: 'id, date',
      settings: 'id',
    })
    this.on('populate', (tx) => {
      void tx.table('exercises').bulkAdd(seedExercises())
    })
  }
}

export const db = new KintoreDB()

import type { BaseRecord, PlannedExercise } from '../db/types'

export type NewFields<T extends BaseRecord> = Omit<T, keyof BaseRecord>

export function newRecord<T extends BaseRecord>(fields: NewFields<T>, now = Date.now()): T {
  return { ...fields, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deleted: false } as T
}

export function alive<T extends BaseRecord>(record: T | undefined): record is T {
  return record !== undefined && !record.deleted
}

export function clonePlannedExercises(list: PlannedExercise[]): PlannedExercise[] {
  return list.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }))
}

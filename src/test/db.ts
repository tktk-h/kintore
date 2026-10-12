import { db } from '../db/db'

/** テストごとにDBを空にして作り直す（定番種目は再投入される） */
export async function resetDb(): Promise<void> {
  await db.delete({ disableAutoOpen: false })
  await db.open()
}

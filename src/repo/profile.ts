import { db } from '../db/db'
import type { Profile } from '../db/types'

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get('me')
}

/** プロフィールは1件だけ。保存すると置き換える */
export async function saveProfile(p: Omit<Profile, 'id' | 'updatedAt'>): Promise<void> {
  await db.profile.put({ ...p, id: 'me', updatedAt: Date.now() })
}

import base, { PointerEventsCheckLevel } from '@testing-library/user-event'

/**
 * テスト用の userEvent。直接呼ぶ API（userEvent.click など）と同じく呼ぶたびに新しく用意するが、
 * 操作の間の待ち（delay）をなくし、クリックのたびの pointer-events の確認を省いて速くする。
 */
type UserEvent = ReturnType<typeof base.setup>
const fresh = (): UserEvent => base.setup({ delay: null, pointerEventsCheck: PointerEventsCheckLevel.Never })

export const userEvent = {
  click: (...args: Parameters<UserEvent['click']>) => fresh().click(...args),
  dblClick: (...args: Parameters<UserEvent['dblClick']>) => fresh().dblClick(...args),
  type: (...args: Parameters<UserEvent['type']>) => fresh().type(...args),
  clear: (...args: Parameters<UserEvent['clear']>) => fresh().clear(...args),
  selectOptions: (...args: Parameters<UserEvent['selectOptions']>) => fresh().selectOptions(...args),
  tab: (...args: Parameters<UserEvent['tab']>) => fresh().tab(...args),
  upload: (...args: Parameters<UserEvent['upload']>) => fresh().upload(...args),
  keyboard: (...args: Parameters<UserEvent['keyboard']>) => fresh().keyboard(...args),
}

export default userEvent

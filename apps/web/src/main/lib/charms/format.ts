import type { Slot } from '@swv/data'
import { SLOT_TARGET_LABELS } from '@/constants/charms'

/** 「武器用 Lv1・防具用 Lv2」。空なら「なし」。 */
export function slotsLabel(slots: readonly Slot[]): string {
  if (slots.length === 0) return 'なし'
  return slots.map((slot) => `${SLOT_TARGET_LABELS[slot.target]} Lv${slot.level}`).join('・')
}

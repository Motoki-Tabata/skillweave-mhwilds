import type { Slot } from '@swv/data'
import { SLOT_TARGET_LABELS } from '@/constants/charms'
import type { CharmPayload, NameOf } from '@/lib/charms/types'

/** 「武器用 Lv1・防具用 Lv2」。空なら「なし」。 */
export function slotsLabel(slots: readonly Slot[]): string {
  if (slots.length === 0) return 'なし'
  return slots.map((slot) => `${SLOT_TARGET_LABELS[slot.target]} Lv${slot.level}`).join('・')
}

/** 「レア8・攻撃 Lv2・見切り Lv1・武器用 Lv1」。読み上げのラベルと削除の確認に使う。スキルが無ければ「スキルなし」。 */
export function charmSummary(payload: CharmPayload, nameOf: NameOf): string {
  const skills =
    payload.skills.length === 0
      ? ['スキルなし']
      : payload.skills.map((skill) => `${nameOf(skill.skillId)} Lv${skill.level}`)
  const slots = payload.slots.length === 0 ? [] : [slotsLabel(payload.slots)]
  return [`レア${payload.rarity}`, ...skills, ...slots].join('・')
}

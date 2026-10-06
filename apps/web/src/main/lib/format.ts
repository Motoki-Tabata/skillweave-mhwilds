import type { MasterWeapon, Slot } from '@swv/data'

/** 「Lv3・Lv2・Lv1」。スロットが無いときは「なし」。 */
export function formatSlotLevels(slots: readonly Slot[]): string {
  return slots.length === 0 ? 'なし' : slots.map((slot) => `Lv${slot.level}`).join('・')
}

/** 「攻撃力 210 ／ 会心 25% ／ スロット Lv3・Lv2・Lv1」。武器種は含めない。 */
export function formatWeaponStats(weapon: MasterWeapon): string {
  return `攻撃力 ${weapon.attack} ／ 会心 ${weapon.affinity}% ／ スロット ${formatSlotLevels(weapon.slots)}`
}

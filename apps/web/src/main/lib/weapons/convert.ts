import type { SetBonusId } from '@swv/data'
import type { SolverWeapon, Uuid } from '@swv/solver'
import { elementTypeName, ELEMENT_DISPLAY_FACTOR } from '@/constants/weapons'
import { weaponTypeName } from '@/constants/weaponTypes'
import type { StoredWeapon, WeaponPayload } from '@/lib/weapons/types'
import type { ValidateContext } from '@/lib/weapons/validate'

export const MISSING_BASE_WEAPON_NAME = '（基の武器が見つかりません）'

/** 保存した武器をソルバーの個体差のある武器にする（武器スキルは空）。 */
export function toSolverWeapon(weapon: Pick<StoredWeapon, 'id' | 'payload'>): SolverWeapon {
  const { payload } = weapon
  return {
    kind: 'custom',
    id: weapon.id as Uuid,
    baseWeaponId: payload.baseWeaponId,
    attack: payload.attack,
    affinity: payload.affinity,
    ...(payload.element === undefined ? {} : { element: { ...payload.element } }),
    slots: payload.slots.map((slot) => ({ target: slot.target, level: slot.level })),
    skills: [],
    setBonusIds: [payload.seriesBonusId, payload.groupBonusId].filter(
      (id): id is SetBonusId => id !== null,
    ),
  }
}

/** 表示名。名前が空なら基の武器の名前、基の武器もマスターに無ければ「（基の武器が見つかりません）」。 */
export function weaponDisplayName(payload: WeaponPayload, ctx: ValidateContext): string {
  if (payload.name !== '') return payload.name
  return ctx.bundle.weapons.some((weapon) => weapon.id === payload.baseWeaponId)
    ? ctx.nameOf(payload.baseWeaponId)
    : MISSING_BASE_WEAPON_NAME
}

/** 基の武器の武器種の正式名。基の武器がマスターに無ければ null。 */
export function weaponTypeLabel(payload: WeaponPayload, ctx: ValidateContext): string | null {
  const base = ctx.bundle.weapons.find((weapon) => weapon.id === payload.baseWeaponId)
  return base === undefined ? null : weaponTypeName(base.weaponType)
}

/** 「攻撃力 <n> ／ 会心 <n>% ／ <属性> <値> ／ スロット Lv<n>・…」。属性値は装備画面の表示値。 */
export function weaponSpecLine(payload: WeaponPayload): string {
  const parts = [`攻撃力 ${payload.attack}`, `会心 ${payload.affinity}%`]
  if (payload.element !== undefined) {
    parts.push(
      `${elementTypeName(payload.element.type)} ${payload.element.value * ELEMENT_DISPLAY_FACTOR}`,
    )
  }
  const levels = payload.slots.map((slot) => `Lv${slot.level}`).join('・')
  parts.push(payload.slots.length === 0 ? 'スロット なし' : `スロット ${levels}`)
  return parts.join(' ／ ')
}

function bonusName(id: SetBonusId, ctx: ValidateContext): string {
  const bonus = ctx.bundle.setBonuses.find((item) => item.id === id)
  return ctx.nameOf(bonus === undefined ? id : bonus.skillId)
}

/** 付与スキルの表示（シリーズ→グループの順）。「<名前>（シリーズ）」「<名前>（グループ）」。 */
export function weaponBonusLabels(payload: WeaponPayload, ctx: ValidateContext): string[] {
  const labels: string[] = []
  if (payload.seriesBonusId !== null) {
    labels.push(`${bonusName(payload.seriesBonusId, ctx)}（シリーズ）`)
  }
  if (payload.groupBonusId !== null) {
    labels.push(`${bonusName(payload.groupBonusId, ctx)}（グループ）`)
  }
  return labels
}

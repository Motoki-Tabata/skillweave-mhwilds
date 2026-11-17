import type { ConditionId, Effect, EffectStat } from '@swv/data'
import { weaponTypeOrder, weaponTypeShortName } from '@/constants/weaponTypes'
import { elementTypeName } from '@/constants/weapons'
import { formatMultiplier } from '@/lib/format'

/** 補完の先頭。 */
export const EFFECT_SUMMARY_PREFIX = '効果: '

/** 加算の値は丸めずに、正に `+`・負に半角の `-` を付ける。 */
function signed(value: number): string {
  return value < 0 ? String(value) : `+${value}`
}

/** 耐性値の区別の表示名（「値」は付けない）。 */
const RESISTANCE_NAMES: Record<string, string> = {
  fire: '火',
  water: '水',
  thunder: '雷',
  ice: '氷',
  dragon: '龍',
  all: '全属性',
}

/** 属性値・状態異常値の加算は、マスターの値 × 10 を整数に丸めた表示値で出す。 */
function displayValue(value: number): number {
  return Math.round(value * 10)
}

/** 区別があれば属性の表示名を前に付ける（区別なしは label だけ）。 */
function withElement(effect: Effect, label: string): string {
  return effect.element === undefined ? label : `${elementTypeName(effect.element)}値`
}

const EFFECT_TEXT: Record<EffectStat, (effect: Effect) => string> = {
  attack_add: (e) => `攻撃力 ${signed(e.value)}`,
  attack_mul: (e) => `攻撃力 ×${formatMultiplier(e.value)}`,
  affinity_add: (e) => `会心率 ${signed(e.value)}%`,
  crit_mul: (e) => `会心倍率 ${formatMultiplier(e.value)}`,
  element_add: (e) => `${withElement(e, '属性値')} ${signed(displayValue(e.value))}`,
  element_mul: (e) => `${withElement(e, '属性値')} ×${formatMultiplier(e.value)}`,
  status_add: (e) => `${withElement(e, '状態異常値')} ${signed(displayValue(e.value))}`,
  status_mul: (e) => `${withElement(e, '状態異常値')} ×${formatMultiplier(e.value)}`,
  element_crit_mul: (e) => `属性の会心倍率 ${formatMultiplier(e.value)}`,
  status_crit_mul: (e) => `状態異常の会心倍率 ${formatMultiplier(e.value)}`,
  defense_add: (e) => `防御力 ${signed(e.value)}`,
  defense_mul: (e) => `防御力 ×${formatMultiplier(e.value)}`,
  resistance_add: (e) =>
    `${RESISTANCE_NAMES[e.element ?? 'all'] ?? e.element}耐性 ${signed(e.value)}`,
}

/**
 * そのレベルの効果をすべて使った補完の文（「効果: 攻撃力 ×1.04・攻撃力 +9」）。
 * 発動条件が同じ効果を1つの組にし、条件付きの組は末尾に「（<条件の名前>）」を付ける。
 * 組の並びは最初に出た順。効果が無いときは null（補完を出さない）。
 */
export function summarizeEffects(
  effects: readonly Effect[],
  conditionName: (id: ConditionId) => string,
  weaponType?: string,
): string | null {
  // 武器種が分かるときは、武器種を持つ効果をその武器種のものだけにし、［］にはその武器種 1 つを出す
  const kept: { effect: Effect; types: string[] | undefined }[] = []
  for (const effect of effects) {
    const types = effect.weaponTypes
    if (types === undefined) kept.push({ effect, types })
    else if (weaponType === undefined) kept.push({ effect, types: sortedWeaponTypes(types) })
    else if (types.includes(weaponType)) kept.push({ effect, types: [weaponType] })
  }
  if (kept.length === 0) return null
  // Map は挿入順を保つので、組は最初に出た順になる。鍵は発動条件と武器種の集合（並びを問わない）
  const groups = new Map<
    string,
    { conditionId: ConditionId | undefined; types: string[] | undefined; texts: string[] }
  >()
  for (const { effect, types } of kept) {
    const key = JSON.stringify([effect.conditionId ?? null, types ?? null])
    const group = groups.get(key) ?? { conditionId: effect.conditionId, types, texts: [] }
    group.texts.push(EFFECT_TEXT[effect.stat](effect))
    groups.set(key, group)
  }
  const parts = Array.from(groups.values(), ({ conditionId, types, texts }) => {
    const condition = conditionId === undefined ? '' : `（${conditionName(conditionId)}）`
    const weapons = types === undefined ? '' : `［${types.map(weaponTypeShortName).join('・')}］`
    return `${texts.join('・')}${condition}${weapons}`
  })
  return EFFECT_SUMMARY_PREFIX + parts.join(' ／ ')
}

/** ゲーム内の順に並べる（定数に無い値は末尾。重複は除く）。 */
function sortedWeaponTypes(types: readonly string[]): string[] {
  return [...new Set(types)].sort((a, b) => weaponTypeOrder(a) - weaponTypeOrder(b))
}

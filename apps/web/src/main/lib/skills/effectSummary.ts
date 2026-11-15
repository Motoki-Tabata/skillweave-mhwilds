import type { ConditionId, Effect, EffectStat } from '@swv/data'
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
): string | null {
  if (effects.length === 0) return null
  // Map は挿入順を保つので、組は最初に出た順になる。undefined は常時の組
  const groups = new Map<ConditionId | undefined, string[]>()
  for (const effect of effects) {
    const texts = groups.get(effect.conditionId) ?? []
    texts.push(EFFECT_TEXT[effect.stat](effect))
    groups.set(effect.conditionId, texts)
  }
  const parts = Array.from(groups, ([conditionId, texts]) => {
    const joined = texts.join('・')
    return conditionId === undefined ? joined : `${joined}（${conditionName(conditionId)}）`
  })
  return EFFECT_SUMMARY_PREFIX + parts.join(' ／ ')
}

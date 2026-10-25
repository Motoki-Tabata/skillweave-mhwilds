import type { ConditionId, Effect, EffectStat } from '@swv/data'
import { formatMultiplier } from '@/lib/format'

/** 補完の先頭。 */
export const EFFECT_SUMMARY_PREFIX = '効果: '

/** 加算の値は丸めずに、正に `+`・負に半角の `-` を付ける。 */
function signed(value: number): string {
  return value < 0 ? String(value) : `+${value}`
}

const EFFECT_TEXT: Record<EffectStat, (value: number) => string> = {
  attack_add: (value) => `攻撃力 ${signed(value)}`,
  attack_mul: (value) => `攻撃力 ×${formatMultiplier(value)}`,
  affinity_add: (value) => `会心率 ${signed(value)}%`,
  crit_mul: (value) => `会心倍率 ${formatMultiplier(value)}`,
  element_add: (value) => `属性値 ${signed(value)}`,
  element_mul: (value) => `属性値 ×${formatMultiplier(value)}`,
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
    texts.push(EFFECT_TEXT[effect.stat](effect.value))
    groups.set(effect.conditionId, texts)
  }
  const parts = Array.from(groups, ([conditionId, texts]) => {
    const joined = texts.join('・')
    return conditionId === undefined ? joined : `${joined}（${conditionName(conditionId)}）`
  })
  return EFFECT_SUMMARY_PREFIX + parts.join(' ／ ')
}

/** 効果と発動条件の規則。overlay の読み込み（overlay.ts）と出力前の検証（validate.ts）が共有する */

export const EFFECT_STATS: readonly string[] = [
  'attack_add',
  'attack_mul',
  'affinity_add',
  'crit_mul',
]

/** `crit_mul` の下限（既定の会心倍率） */
export const MIN_CRIT_MUL = 1.25

/** 発動条件の ID の形式（`design/master-data.md` §4） */
export const CONDITION_ID_PATTERN = /^cd:[a-z][a-z0-9_]*$/

/** 効果の `stat` と `value` の規則に反していれば、その理由を返す。守っていれば undefined */
export function effectProblem(stat: unknown, value: unknown): string | undefined {
  if (typeof stat !== 'string' || !EFFECT_STATS.includes(stat)) {
    return `stat ${JSON.stringify(stat)} は ${EFFECT_STATS.join('・')} のどれでもありません`
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    const shown = typeof value === 'number' ? String(value) : JSON.stringify(value)
    return `value ${shown} が有限の数ではありません`
  }
  if ((stat === 'attack_add' || stat === 'affinity_add') && !Number.isInteger(value)) {
    return `${stat} の value ${value} が整数ではありません`
  }
  if (stat === 'attack_mul' && value <= 0) {
    return `attack_mul の value ${value} が 0 より大きくありません`
  }
  if (stat === 'crit_mul' && value < MIN_CRIT_MUL) {
    return `crit_mul の value ${value} が ${MIN_CRIT_MUL} 以上ではありません`
  }
  return undefined
}

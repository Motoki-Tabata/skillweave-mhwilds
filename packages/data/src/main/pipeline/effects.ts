/** 効果と発動条件の規則。overlay の読み込み（overlay.ts）と出力前の検証（validate.ts）が共有する */

export const EFFECT_STATS: readonly string[] = [
  'attack_add',
  'attack_mul',
  'affinity_add',
  'crit_mul',
  'element_add',
  'element_mul',
  'status_add',
  'status_mul',
  'element_crit_mul',
  'status_crit_mul',
  'defense_add',
  'defense_mul',
  'resistance_add',
]

/** `crit_mul` の下限（既定の会心倍率） */
export const MIN_CRIT_MUL = 1.25

/** 属性の会心倍率・状態異常の会心倍率の下限（倍率として下げない値だけを受け付ける） */
export const MIN_ELEMENT_CRIT_MUL = 1

/** 発動条件の ID の形式（`design/master-data.md` §4） */
export const CONDITION_ID_PATTERN = /^cd:[a-z][a-z0-9_]*$/

const ELEMENTS = ['fire', 'water', 'thunder', 'ice', 'dragon']
const STATUSES = ['poison', 'paralysis', 'sleep', 'blastblight']

/** stat ごとに `element` に取れる値。`required` は省略を許さない。載っていない stat は `element` を持てない */
const ELEMENT_RULES: Readonly<Record<string, { allowed: readonly string[]; required: boolean }>> = {
  element_add: { allowed: ELEMENTS, required: false },
  element_mul: { allowed: ELEMENTS, required: false },
  status_add: { allowed: STATUSES, required: false },
  status_mul: { allowed: STATUSES, required: false },
  resistance_add: { allowed: [...ELEMENTS, 'all'], required: true },
}

/** 10 倍が整数（小数第1位まで）か。浮動小数の誤差は 1e-9 未満なら無視する */
const isTenths = (value: number): boolean => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9

function valueProblem(stat: string, value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    const shown = typeof value === 'number' ? String(value) : JSON.stringify(value)
    return `value ${shown} が有限の数ではありません`
  }
  if (
    ['attack_add', 'affinity_add', 'defense_add', 'resistance_add'].includes(stat) &&
    !Number.isInteger(value)
  ) {
    return `${stat} の value ${value} が整数ではありません`
  }
  if (['element_add', 'status_add'].includes(stat) && !isTenths(value)) {
    return `${stat} の value ${value} が小数第1位までではありません`
  }
  if (['attack_mul', 'element_mul', 'status_mul', 'defense_mul'].includes(stat) && value <= 0) {
    return `${stat} の value ${value} が 0 より大きくありません`
  }
  if (stat === 'crit_mul' && value < MIN_CRIT_MUL) {
    return `crit_mul の value ${value} が ${MIN_CRIT_MUL} 以上ではありません`
  }
  if (['element_crit_mul', 'status_crit_mul'].includes(stat) && value < MIN_ELEMENT_CRIT_MUL) {
    return `${stat} の value ${value} が ${MIN_ELEMENT_CRIT_MUL} 以上ではありません`
  }
  return undefined
}

function elementProblem(stat: string, element: unknown): string | undefined {
  const rule = ELEMENT_RULES[stat]
  if (rule === undefined) {
    return element === undefined ? undefined : `${stat} は element を持てません`
  }
  if (element === undefined) return rule.required ? `${stat} には element が必要です` : undefined
  if (typeof element !== 'string' || !rule.allowed.includes(element)) {
    return `${stat} の element ${JSON.stringify(element)} は ${rule.allowed.join('・')} のどれでもありません`
  }
  return undefined
}

/** 効果の `stat`・`value`・`element` の規則に反していれば、その理由を返す。守っていれば undefined */
export function effectProblem(
  stat: unknown,
  value: unknown,
  element?: unknown,
): string | undefined {
  if (typeof stat !== 'string' || !EFFECT_STATS.includes(stat)) {
    return `stat ${JSON.stringify(stat)} は ${EFFECT_STATS.join('・')} のどれでもありません`
  }
  return valueProblem(stat, value) ?? elementProblem(stat, element)
}

/** `weaponTypes` の規則（空・非配列・非文字列・武器種の集合に無い要素・重複）に反していれば、その理由を返す。守っていれば undefined */
export function weaponTypesProblem(value: unknown, known: ReadonlySet<string>): string | undefined {
  if (!Array.isArray(value)) return `weaponTypes ${JSON.stringify(value)} が配列ではありません`
  if (value.length === 0) return 'weaponTypes が空の配列です'
  const seen = new Set<string>()
  for (const item of value as unknown[]) {
    if (typeof item !== 'string') {
      return `weaponTypes の要素 ${JSON.stringify(item)} が文字列ではありません`
    }
    if (!known.has(item)) {
      return `weaponTypes の要素 ${JSON.stringify(item)} が武器種（${[...known].join('・')}）のどれでもありません`
    }
    if (seen.has(item)) return `weaponTypes の要素 ${JSON.stringify(item)} が重複しています`
    seen.add(item)
  }
  return undefined
}

export interface OverlapCandidate {
  stat: string
  element?: unknown
  conditionId?: unknown
  weaponTypes?: readonly string[]
}

/**
 * 同じレベルの効果の列で、`stat`・`element`・`conditionId` がすべて同じ効果どうしの武器種の集合が交わるものを探す
 * （`weaponTypes` の省略は全武器種）。後の効果ごとに、先の効果と交わるときの理由を返す
 */
export function weaponTypeOverlaps(
  effects: readonly OverlapCandidate[],
  known: ReadonlySet<string>,
): Map<number, string> {
  const problems = new Map<number, string>()
  const kindOf = (effect: OverlapCandidate): string =>
    JSON.stringify([effect.stat, effect.element ?? null, effect.conditionId ?? null])
  const typesOf = (effect: OverlapCandidate): ReadonlySet<string> =>
    new Set(effect.weaponTypes ?? known)
  effects.forEach((effect, index) => {
    const types = typesOf(effect)
    for (let earlier = 0; earlier < index; earlier++) {
      const other = effects[earlier]
      if (other === undefined || kindOf(other) !== kindOf(effect)) continue
      const shared = [...typesOf(other)].filter((type) => types.has(type))
      if (shared.length > 0) {
        problems.set(
          index,
          `${effect.stat} の武器種が先の効果と重なっています（${shared.join('・')}）`,
        )
        return
      }
    }
  })
  return problems
}

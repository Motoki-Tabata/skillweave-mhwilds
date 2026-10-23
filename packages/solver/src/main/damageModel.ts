import type { ConditionId, MasterBundle, MasterSkill, SetBonus, SkillId } from '@swv/data'
import { BASE_CRIT_MULTIPLIER, AFFINITY_LIMIT, effectsAt, isCounted } from './damage'
import type { IlpModel } from './model'
import type { SolverRequest } from './request'
import { sparseRow, type Coefs, type Row } from './rows'
import { findSetBonus, isSetSkill, setBonusLevel, skillLevelOf } from './skills'
import { PARTS, type ResolvedWeapon } from './validate'

/**
 * expectedDamage の ILP（plan D13）。期待値を変数 θ で表す厳密な混合整数計画にする。
 *
 * 追加する列（IlpModel の既存の列 x・y・n・z の後ろ）:
 * - Y(s,l): 対象のスキル s の発動レベル l の 0/1 変数（和が 1。実際のレベルと両側で一致させる）
 * - q(i,l): attack_mul の連鎖の積（連続）
 * - A: 攻撃力（連続）
 * - p_b・m_b・σ・λ: 会心率の正の部分 F⁺・負の部分 F⁻ の2進展開、符号、下端の丸め（0/1）
 * - g_j: 会心倍率の候補（0/1）
 * - w(j,b)・v(b): 積 A·g·p_b と A·m_b の線形化（連続）
 * - θ: 期待値（連続）
 */

const BITS = 7
const NEGATIVE_SLOPE = 0.25 / 100

/** スキルのあるレベルの、有効な条件の下で数える効果の合計 */
export interface LevelEffects {
  add: number
  mul: number
  aff: number
  /** 有効な crit_mul の最大。無ければ 0 */
  crit: number
}

/** 期待値に寄与しうるスキル（有効な条件の下で数える効果を 1 つでも持つ） */
export interface TargetSkill {
  skill: MasterSkill
  /** シリーズ／グループスキルのときの SetBonus */
  bonus?: SetBonus
  /** 添字がレベル（0 〜 最大レベル）。レベル 0 は効果なし */
  levels: LevelEffects[]
}

export interface DamageColumns {
  thetaCol: number
  /** 1 段目の目的（θ だけ 1） */
  stage1Cost: number[]
}

const NEUTRAL: LevelEffects = { add: 0, mul: 1, aff: 0, crit: 0 }

function levelEffects(
  skill: MasterSkill,
  level: number,
  active: ReadonlySet<ConditionId>,
): LevelEffects {
  const result: LevelEffects = { ...NEUTRAL }
  for (const e of effectsAt(skill, level)) {
    if (!isCounted(e, active)) continue
    if (e.stat === 'attack_add') result.add += e.value
    else if (e.stat === 'attack_mul') result.mul *= e.value
    else if (e.stat === 'affinity_add') result.aff += e.value
    else if (e.stat === 'crit_mul') result.crit = Math.max(result.crit, e.value)
  }
  return result
}

function isNeutral(e: LevelEffects): boolean {
  return e.add === 0 && e.mul === 1 && e.aff === 0 && e.crit <= BASE_CRIT_MULTIPLIER
}

/** 対象のスキル R（種別を問わない）。マスターのスキルの並びのまま */
export function damageTargets(master: MasterBundle, request: SolverRequest): TargetSkill[] {
  const active = new Set<ConditionId>(request.activeConditionIds ?? [])
  const result: TargetSkill[] = []
  for (const skill of master.skills) {
    const set = isSetSkill(skill)
    const bonus = set ? findSetBonus(master, skill.id) : undefined
    if (set && bonus === undefined) continue
    const maxLevel = Math.max(skill.maxLevel, ...(bonus?.thresholds.map((t) => t.level) ?? []))
    const levels = Array.from({ length: maxLevel + 1 }, (_, l) => levelEffects(skill, l, active))
    if (levels.every(isNeutral)) continue
    result.push({ skill, ...(bonus === undefined ? {} : { bonus }), levels })
  }
  return result
}

/** 列と行を足していく作業用の入れ物 */
class Builder {
  readonly colLower: number[]
  readonly colUpper: number[]
  readonly colInteger: boolean[]
  readonly rows: Row[]

  constructor(base: IlpModel) {
    this.colLower = [...base.colLower]
    this.colUpper = [...base.colUpper]
    this.colInteger = [...base.colInteger]
    this.rows = [...base.rows]
  }

  addCol(upper: number, integer: boolean): number {
    this.colLower.push(0)
    this.colUpper.push(upper)
    this.colInteger.push(integer)
    return this.colUpper.length - 1
  }

  addBinary(upper = 1): number {
    return this.addCol(upper, true)
  }

  addRow(lower: number, upper: number, coefs: Coefs) {
    this.rows.push(sparseRow(lower, upper, coefs))
  }
}

const negate = (coefs: Coefs): Coefs => coefs.map(([c, v]): [number, number] => [c, -v])

/** 通常のスキルの合計レベルの式と、その上界 */
function ordinaryTotal(
  base: IlpModel,
  weapon: ResolvedWeapon,
  skillId: SkillId,
): { expr: Coefs; constant: number; max: number } {
  const armorExpr = base.armorCols.map((c): [number, number] => [
    c.col,
    skillLevelOf(c.armor.skills, skillId),
  ])
  const charmExpr = base.charmCols.map((c): [number, number] => [
    c.col,
    skillLevelOf(c.charm.skills, skillId),
  ])
  const decoExpr = base.decoCols.map((c): [number, number] => [
    c.col,
    skillLevelOf(c.deco.skills, skillId),
  ])
  const constant = skillLevelOf(weapon.skills, skillId)
  // 装飾品の個数の上界はスロット数の上界
  const maxByPart = new Map<string, number>()
  const slotsByPart = new Map<string, number>()
  for (const c of base.armorCols) {
    const level = skillLevelOf(c.armor.skills, skillId)
    maxByPart.set(c.part, Math.max(maxByPart.get(c.part) ?? 0, level))
    slotsByPart.set(c.part, Math.max(slotsByPart.get(c.part) ?? 0, c.armor.slots.length))
  }
  const sumOf = (m: Map<string, number>) => PARTS.reduce((s, p) => s + (m.get(p) ?? 0), 0)
  const maxCharm = Math.max(0, ...charmExpr.map(([, v]) => v))
  const charmSlots = Math.max(0, ...base.charmCols.map((c) => c.charm.slots.length))
  const slotCap = weapon.slots.length + sumOf(slotsByPart) + charmSlots
  const maxDeco = Math.max(0, ...decoExpr.map(([, v]) => v))
  return {
    expr: [...armorExpr, ...charmExpr, ...decoExpr],
    constant,
    max: constant + sumOf(maxByPart) + maxCharm + maxDeco * slotCap,
  }
}

/** 通常のスキル: 「Σ l·y ≤ 合計レベル」と「合計レベル ≤ Σ l·y + M·y(最大レベル)」 */
function ordinaryLevelRows(
  b: Builder,
  base: IlpModel,
  weapon: ResolvedWeapon,
  target: TargetSkill,
  y: number[],
) {
  const { expr, constant, max } = ordinaryTotal(base, weapon, target.skill.id)
  const top = y.length - 1
  const levelSum: Coefs = y.map((col, l): [number, number] => [col, l])
  b.addRow(-Infinity, constant, [...levelSum, ...negate(expr)])
  // y(最大レベル) = 1 のとき右辺は最大レベル + M で、合計レベルの上界 max を覆えば足りる（M = max − 最大レベル）
  const upperSide: Coefs = y.map((col, l): [number, number] => [
    col,
    l === top ? -Math.max(top, max) : -l,
  ])
  b.addRow(-Infinity, -constant, [...expr, ...upperSide])
}

/** シリーズ／グループスキル: 部位数から決まる段の下限と上限で挟む（届かない段のレベルは 0 に固定） */
function setLevelRows(
  b: Builder,
  base: IlpModel,
  weapon: ResolvedWeapon,
  target: TargetSkill,
  bonus: SetBonus,
  y: number[],
) {
  const weaponHas = weapon.setBonusIds.includes(bonus.id) ? 1 : 0
  const maxPieces = weaponHas + PARTS.length
  const byLevel = new Map<number, number[]>()
  for (let p = 0; p <= maxPieces; p++) {
    const level = setBonusLevel(bonus, p)
    byLevel.set(level, [...(byLevel.get(level) ?? []), p])
  }
  const lower: Coefs = []
  const upper: Coefs = []
  y.forEach((col, level) => {
    const pieces = byLevel.get(level)
    if (pieces === undefined) {
      b.colUpper[col] = 0
      return
    }
    const lo = Math.min(...pieces)
    const hi = Math.max(...pieces)
    if (hi - lo + 1 !== pieces.length) {
      throw new Error(`スキル ${target.skill.id} の段が連続していない（期待値の ILP は未対応）`)
    }
    lower.push([col, lo])
    upper.push([col, -hi])
  })
  const pieceExpr: Coefs = base.armorCols.map((c): [number, number] => [
    c.col,
    c.armor.setBonusIds.includes(bonus.id) ? 1 : 0,
  ])
  b.addRow(-Infinity, weaponHas, [...lower, ...negate(pieceExpr)])
  b.addRow(-Infinity, -weaponHas, [...pieceExpr, ...upper])
}

/** 対象のスキルごとにレベルの変数 Y を作り、実際の発動レベルと一致させる */
function addLevelVariables(
  b: Builder,
  base: IlpModel,
  weapon: ResolvedWeapon,
  targets: readonly TargetSkill[],
): number[][] {
  return targets.map((target) => {
    const y = target.levels.map(() => b.addBinary())
    b.addRow(
      1,
      1,
      y.map((col): [number, number] => [col, 1]),
    )
    if (target.bonus === undefined) ordinaryLevelRows(b, base, weapon, target, y)
    else setLevelRows(b, base, weapon, target, target.bonus, y)
    return y
  })
}

const maxOf = (t: TargetSkill, key: keyof LevelEffects) => Math.max(...t.levels.map((l) => l[key]))
const minOf = (t: TargetSkill, key: keyof LevelEffects) => Math.min(...t.levels.map((l) => l[key]))

/** attack_mul の連鎖と攻撃力 A。A の上界を返す */
function addAttack(
  b: Builder,
  targets: readonly TargetSkill[],
  ys: number[][],
  weapon: ResolvedWeapon,
): { attackCol: number; attackUpper: number } {
  const chain = targets
    .map((t, i) => ({ t, y: ys[i] ?? [] }))
    .filter(({ t }) => t.levels.some((l) => l.mul !== 1))
  let previous: number[] | null = null
  let bound = weapon.attack
  for (const { t, y } of chain) {
    const levelBound = (l: number) => (t.levels[l]?.mul ?? 1) * bound
    const q = t.levels.map((_, l) => b.addCol(levelBound(l), false))
    q.forEach((col, l) => {
      // q(i,l) ≤ 上界·y(i,l)、q(i,l) ≤ mul(i,l)·P(i-1)（P0 は定数なので列の上界に入っている）
      b.addRow(-Infinity, 0, [
        [col, 1],
        [y[l] ?? 0, -levelBound(l)],
      ])
      if (previous !== null) {
        const mul = t.levels[l]?.mul ?? 1
        b.addRow(-Infinity, 0, [[col, 1], ...previous.map((p): [number, number] => [p, -mul])])
      }
    })
    bound *= Math.max(...t.levels.map((l) => l.mul))
    previous = q
  }
  const addUpper = targets.reduce((sum, t) => sum + Math.max(0, maxOf(t, 'add')), 0)
  const attackUpper = bound + addUpper
  const attackCol = b.addCol(attackUpper, false)
  // A = Pk + Σ add·y
  const adds: Coefs = targets.flatMap((t, i) =>
    t.levels.map((l, level): [number, number] => [ys[i]?.[level] ?? 0, -l.add]),
  )
  const chainTail: Coefs = (previous ?? []).map((p): [number, number] => [p, -1])
  const constant = previous === null ? weapon.attack : 0
  b.addRow(constant, constant, [[attackCol, 1], ...chainTail, ...adds])
  return { attackCol, attackUpper }
}

interface AffinityBits {
  plus: number[]
  minus: number[]
}

/** 会心率の丸めと符号と2進展開（F⁺ − F⁻ ≤ min(100, max(F, −100))） */
function addAffinity(
  b: Builder,
  targets: readonly TargetSkill[],
  ys: number[][],
  weapon: ResolvedWeapon,
): AffinityBits {
  for (const t of targets) {
    if (!t.levels.every((l) => Number.isInteger(l.aff))) {
      throw new Error(`スキル ${t.skill.id} の affinity_add が整数でない（期待値の ILP は未対応）`)
    }
  }
  const plus = Array.from({ length: BITS }, () => b.addBinary())
  const minus = Array.from({ length: BITS }, () => b.addBinary())
  const sign = b.addBinary()
  const weights = (cols: number[]): Coefs => cols.map((c, bit): [number, number] => [c, 2 ** bit])
  const fMin = weapon.affinity + targets.reduce((sum, t) => sum + minOf(t, 'aff'), 0)
  const affExpr: Coefs = targets.flatMap((t, i) =>
    t.levels.map((l, level): [number, number] => [ys[i]?.[level] ?? 0, l.aff]),
  )
  // F⁺ ≤ 100·σ、F⁻ ≤ 100·(1 − σ)
  b.addRow(-Infinity, 0, [...weights(plus), [sign, -AFFINITY_LIMIT]])
  b.addRow(-Infinity, AFFINITY_LIMIT, [...weights(minus), [sign, AFFINITY_LIMIT]])
  const clipped = fMin < -AFFINITY_LIMIT
  const lambda = clipped ? b.addBinary() : null
  const bigM = clipped ? AFFINITY_LIMIT - fMin : 0
  // F⁺ − F⁻ ≤ F（下端で丸めるときは λ = 1 で外す）
  b.addRow(-Infinity, weapon.affinity, [
    ...weights(plus),
    ...negate(weights(minus)),
    ...negate(affExpr),
    ...(lambda === null ? [] : [[lambda, -bigM] as [number, number]]),
  ])
  if (lambda !== null) {
    // λ = 0 なら F ≥ −100（F < −100 なら λ = 1 になり、F⁺ − F⁻ ≤ −100 に丸める）
    b.addRow(-AFFINITY_LIMIT - weapon.affinity, Infinity, [
      ...affExpr,
      [lambda, -AFFINITY_LIMIT - fMin],
    ])
    b.addRow(-Infinity, AFFINITY_LIMIT, [
      ...weights(plus),
      ...negate(weights(minus)),
      [lambda, 2 * AFFINITY_LIMIT],
    ])
  }
  return { plus, minus }
}

/** 会心倍率の候補 g_j（1.25 と対象のスキルの crit_mul の値）。g > 1.25 は、その値以上の crit_mul を持つレベルの y の和以下 */
function addCritMultiplier(
  b: Builder,
  targets: readonly TargetSkill[],
  ys: number[][],
): { value: number; col: number }[] {
  const values = [
    BASE_CRIT_MULTIPLIER,
    ...new Set(
      targets.flatMap((t) => t.levels.map((l) => l.crit)).filter((v) => v > BASE_CRIT_MULTIPLIER),
    ),
  ].toSorted((x, y) => x - y)
  const candidates = values.map((value) => ({ value, col: b.addBinary() }))
  b.addRow(
    1,
    1,
    candidates.map(({ col }): [number, number] => [col, 1]),
  )
  for (const { value, col } of candidates) {
    if (value === BASE_CRIT_MULTIPLIER) continue
    const supports: Coefs = targets.flatMap((t, i) =>
      t.levels.flatMap((l, level): [number, number][] =>
        l.crit >= value ? [[ys[i]?.[level] ?? 0, -1]] : [],
      ),
    )
    b.addRow(-Infinity, 0, [[col, 1], ...supports])
  }
  return candidates
}

/** 積 A·g·p_b と A·m_b の線形化と、θ の定義の等式 */
function addTheta(
  b: Builder,
  attack: { attackCol: number; attackUpper: number },
  bits: AffinityBits,
  crit: { value: number; col: number }[],
): number {
  const { attackCol, attackUpper } = attack
  const thetaTerms: Coefs = []
  for (const { value, col: g } of crit) {
    bits.plus.forEach((p, bit) => {
      const w = b.addCol(attackUpper, false)
      b.addRow(-Infinity, 0, [
        [w, 1],
        [attackCol, -1],
      ])
      b.addRow(-Infinity, 0, [
        [w, 1],
        [p, -attackUpper],
      ])
      b.addRow(-Infinity, 0, [
        [w, 1],
        [g, -attackUpper],
      ])
      thetaTerms.push([w, ((value - 1) / 100) * 2 ** bit])
    })
  }
  bits.minus.forEach((m, bit) => {
    const v = b.addCol(attackUpper, false)
    // v ≥ A − 上界·(1 − m)
    b.addRow(-attackUpper, Infinity, [
      [v, 1],
      [attackCol, -1],
      [m, -attackUpper],
    ])
    thetaTerms.push([v, -NEGATIVE_SLOPE * 2 ** bit])
  })
  const theta = b.addCol(Infinity, false)
  b.addRow(0, 0, [[theta, 1], [attackCol, -1], ...negate(thetaTerms)])
  return theta
}

/** 基本の ILP に期待値の列と行を足す。他の目的関数の ILP は変えない */
export function extendWithDamage(
  base: IlpModel,
  targets: readonly TargetSkill[],
  weapon: ResolvedWeapon,
  infinity: number,
): IlpModel {
  const b = new Builder(base)
  const ys = addLevelVariables(b, base, weapon, targets)
  const attack = addAttack(b, targets, ys, weapon)
  const bits = addAffinity(b, targets, ys, weapon)
  const crit = addCritMultiplier(b, targets, ys)
  const thetaCol = addTheta(b, attack, bits, crit)
  const numCols = b.colUpper.length
  const stage1Cost = Array.from({ length: numCols }, (_, i) => (i === thetaCol ? 1 : 0))
  const swapInfinity = (v: number) => {
    if (v === Infinity) return infinity
    return v === -Infinity ? -infinity : v
  }
  return {
    ...base,
    numCols,
    colCost: [...base.colCost, ...Array.from({ length: numCols - base.numCols }, () => 0)],
    colLower: b.colLower,
    colUpper: b.colUpper.map(swapInfinity),
    colInteger: b.colInteger,
    rows: b.rows.map((r) => ({ ...r, lower: swapInfinity(r.lower), upper: swapInfinity(r.upper) })),
    damage: { thetaCol, stage1Cost },
  }
}

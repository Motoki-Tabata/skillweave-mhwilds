/**
 * 024 worker-solve-perf・plan D1/D2: expectedDamage の求解方式の試作と測定（CI では実行しない）。
 * 時間は検査（assert）せず、表を console に出すだけ。src/main は変えず、本実装の関数を読んで写しを書き換える。
 *
 * 実行: pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false src/test/damagePrototype.measure.ts
 *
 * 環境変数（未指定は括弧内）:
 * - PROTO_CANDIDATES: 候補名のカンマ区切り。名前は「+」で並べた部品の組み合わせ（既定は DEFAULT_CANDIDATES）。
 *     current（現行の solveBuilds）・proto（現行の写し。写しの検算）・
 *     a-bounds（(a) 会心倍率の候補ごとの部分問題。g の列の上下限で固定）・a-rebuild（(a) g と積の列を持たないモデルを作る）・
 *     b（支配の除外）・lb（部分問題に θ ≥ 最良 − ε を渡す）・ub（θ ≤ 既知の上界 + ε を渡す）・
 *     init（基本の ILP の解を初期解にする）・h03/h10（mip_heuristic_effort 0.3／1.0）・
 *     sym0（mip_detect_symmetry false）・cut（mip_lp_age_limit 5。サイクルを早く捨てる）
 * - PROTO_CASES: ケース ID のカンマ区切り（既定は全 6 件: k3-sat,k3-unsat,k6-sat,k6-unsat,k10-sat,k10-unsat）
 * - PROTO_CRAFTED: on / off / both（既定 both）
 * - PROTO_REPEATS: 各ケースの測定回数（既定 1）
 */
import highsLoader, { type Highs, type Model } from 'highs'
import type { MasterBundle, MasterSkill, SetBonusId, SkillId, SkillLevel, Slot } from '@swv/data'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { BASE_CRIT_MULTIPLIER, evaluateDamage } from '../main/damage'
import { damageTargets, type TargetSkill } from '../main/damageModel'
import { buildModel, readSelection, type IlpModel, type Row, type Selection } from '../main/model'
import { assembleBuild } from '../main/placement'
import type { SolvedBuild, SolverCharm, SolverRequest, SolverStatus } from '../main/request'
import { findSetBonus, isSetSkill, skillLevelOf } from '../main/skills'
import { DAMAGE_EPSILON, solveBuilds } from '../main/solveBuilds'
import { validateRequest, type ResolvedWeapon } from '../main/validate'
import { makeRequest, skill } from './support/builders'
import { topRankCraftedCharms } from './support/craftedCharms'
import { loadRealMaster } from './support/realMaster'

const TIMEOUT_MS = 60_000
const MAX_RESULTS = 10
/** 同じ値と見なす θ の差（ソルバーの数値誤差。DAMAGE_EPSILON より小さい） */
const NOISE = 1e-7

const SK = {
  fire: 'sk:-3666104',
  scale: 'sk:1487598336',
  taijutsu: 'sk:-1689391744',
  evade: 'sk:144660544',
  challenger: 'sk:1865909632',
  weak: 'sk:-397570464',
  grudge: 'sk:1359821952',
  fullcharge: 'sk:2106877312',
  release: 'sk:1763191040',
  stamina: 'sk:-315492576',
}

type Pair = [skillId: string, level: number]
interface Case {
  id: string
  required: Pair[]
}

/** solveBuilds.measure.ts の expectedDamage のケースと同じ必須スキルの組 */
const CASES: Case[] = [
  {
    id: 'k3-sat',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
    ],
  },
  {
    id: 'k3-unsat',
    required: [
      [SK.fire, 2],
      [SK.evade, 5],
      [SK.challenger, 5],
    ],
  },
  {
    id: 'k6-sat',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
      [SK.evade, 3],
      [SK.challenger, 3],
      [SK.weak, 3],
    ],
  },
  {
    id: 'k6-unsat',
    required: [
      [SK.fire, 2],
      [SK.taijutsu, 4],
      [SK.evade, 4],
      [SK.challenger, 4],
      [SK.weak, 4],
      [SK.grudge, 3],
    ],
  },
  {
    id: 'k10-sat',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
      [SK.evade, 2],
      [SK.challenger, 2],
      [SK.weak, 2],
      [SK.grudge, 1],
      [SK.fullcharge, 1],
      [SK.release, 1],
      [SK.stamina, 1],
    ],
  },
  {
    id: 'k10-unsat',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 2],
      [SK.evade, 2],
      [SK.challenger, 2],
      [SK.weak, 2],
      [SK.grudge, 2],
      [SK.fullcharge, 2],
      [SK.release, 2],
      [SK.stamina, 1],
    ],
  },
]

// ---------------------------------------------------------------- 候補の設定

interface Config {
  split: 'none' | 'bounds' | 'rebuild'
  dominance: boolean
  lb: boolean
  ub: boolean
  init: boolean
  options: Record<string, number | boolean>
}

const OPTION_PARTS: Record<string, Record<string, number | boolean>> = {
  h03: { mip_heuristic_effort: 0.3 },
  h10: { mip_heuristic_effort: 1 },
  sym0: { mip_detect_symmetry: false },
  cut: { mip_lp_age_limit: 5 },
}

const DEFAULT_CANDIDATES = [
  'current',
  'proto',
  'a-bounds',
  'a-rebuild',
  'b',
  'ub',
  'init',
  'h03',
  'h10',
  'sym0',
  'cut',
  'a-bounds+lb',
  'a-rebuild+lb',
  'a-rebuild+b',
  'a-rebuild+b+lb',
]

function parseConfig(name: string): Config | 'current' {
  if (name === 'current') return 'current'
  const config: Config = {
    split: 'none',
    dominance: false,
    lb: false,
    ub: false,
    init: false,
    options: {},
  }
  for (const part of name.split('+')) {
    if (part === 'proto') continue
    else if (part === 'a-bounds') config.split = 'bounds'
    else if (part === 'a-rebuild') config.split = 'rebuild'
    else if (part === 'b') config.dominance = true
    else if (part === 'lb') config.lb = true
    else if (part === 'ub') config.ub = true
    else if (part === 'init') config.init = true
    else if (OPTION_PARTS[part] !== undefined) Object.assign(config.options, OPTION_PARTS[part])
    else throw new Error(`知らない候補の部品: ${part}`)
  }
  return config
}

// ---------------------------------------------------------------- (b) 支配される候補の除外（plan D4）

interface Relevant {
  ordinary: SkillId[]
  bonuses: SetBonusId[]
}

function relevantSkills(
  master: MasterBundle,
  request: SolverRequest,
  targets: TargetSkill[],
): Relevant {
  const ordinary = new Set<SkillId>()
  const bonuses = new Set<SetBonusId>()
  for (const t of targets) {
    if (t.bonus === undefined) ordinary.add(t.skill.id)
    else bonuses.add(t.bonus.id)
  }
  for (const r of request.required) {
    const found: MasterSkill | undefined = master.skills.find((s) => s.id === r.skillId)
    if (!isSetSkill(found)) ordinary.add(r.skillId)
    else {
      const bonus = findSetBonus(master, r.skillId)
      if (bonus !== undefined) bonuses.add(bonus.id)
    }
  }
  return { ordinary: [...ordinary], bonuses: [...bonuses] }
}

interface Profile {
  levels: number[]
  sets: boolean[]
  weaponSlots: number[]
  armorSlots: number[]
}

function slotVector(slots: readonly Slot[], target: Slot['target']): number[] {
  return slots
    .filter((s) => s.target === target)
    .map((s) => s.level)
    .sort((a, b) => b - a)
}

function profileOf(
  rel: Relevant,
  skills: readonly SkillLevel[],
  setBonusIds: readonly SetBonusId[],
  slots: readonly Slot[],
): Profile {
  return {
    levels: rel.ordinary.map((id) => skillLevelOf(skills, id)),
    sets: rel.bonuses.map((id) => setBonusIds.includes(id)),
    weaponSlots: slotVector(slots, 'weapon'),
    armorSlots: slotVector(slots, 'armor'),
  }
}

const vectorLe = (x: readonly number[], y: readonly number[]) => x.every((v, i) => v <= (y[i] ?? 0))

/** x が y に支配される（x の関係する属性がすべて y 以下） */
function profileLe(x: Profile, y: Profile): boolean {
  return (
    vectorLe(x.levels, y.levels) &&
    x.sets.every((has, i) => !has || y.sets[i] === true) &&
    vectorLe(x.weaponSlots, y.weaponSlots) &&
    vectorLe(x.armorSlots, y.armorSlots)
  )
}

/** 支配される要素を外す。互いに支配し合うものは並びの最初だけ残す */
function undominated<T>(items: readonly T[], dominates: (x: T, y: T) => boolean): T[] {
  return items.filter(
    (x, i) => !items.some((y, j) => j !== i && dominates(x, y) && (!dominates(y, x) || j < i)),
  )
}

function reduceCandidates(
  master: MasterBundle,
  request: SolverRequest,
): { master: MasterBundle; request: SolverRequest } {
  const rel = relevantSkills(master, request, damageTargets(master, request))
  const armorProfile = new Map(
    master.armors.map((a) => [a, profileOf(rel, a.skills, a.setBonusIds, a.slots)]),
  )
  const armors = undominated(master.armors, (x, y) => {
    const px = armorProfile.get(x)
    const py = armorProfile.get(y)
    return x.part === y.part && px !== undefined && py !== undefined && profileLe(px, py)
  })
  const decoLevels = (d: MasterBundle['decorations'][number]) =>
    rel.ordinary.map((id) => skillLevelOf(d.skills, id))
  const decorations = undominated(
    master.decorations,
    (x, y) =>
      x.target === y.target && x.slotLevel >= y.slotLevel && vectorLe(decoLevels(x), decoLevels(y)),
  )
  const masterIds = new Set<string>(master.charms.map((c) => c.id))
  const crafted = request.charms.filter((c) => masterIds.has(c.id))
  const charmProfile = new Map(crafted.map((c) => [c, profileOf(rel, c.skills, [], c.slots)]))
  const keptCrafted = new Set<SolverCharm>(
    undominated(crafted, (x, y) => {
      const px = charmProfile.get(x)
      const py = charmProfile.get(y)
      return px !== undefined && py !== undefined && profileLe(px, py)
    }),
  )
  const charms = request.charms.filter((c) => !masterIds.has(c.id) || keptCrafted.has(c))
  return { master: { ...master, armors, decorations }, request: { ...request, charms } }
}

// ---------------------------------------------------------------- モデルの分解（(a)）

interface Located {
  baseNum: number
  gCols: number[]
  /** gCols と同じ並びの会心倍率の値 */
  gValues: number[]
  /** gCols と同じ並びの、積 A·g·p_b の列 */
  wCols: number[][]
  thetaCol: number
}

/** 期待値の拡張の最初の列（最初の対象のスキルのレベルの変数）。基本の列はその手前までで、行は全部その手前の列だけを使う */
function findBaseNum(ilp: IlpModel, targets: TargetSkill[]): number {
  const baseMax = Math.max(
    ...ilp.armorCols.map((c) => c.col),
    ...ilp.charmCols.map((c) => c.col),
    ...ilp.decoCols.map((c) => c.col),
  )
  const width = targets[0]?.levels.length ?? 0
  const row = ilp.rows.find(
    (r) =>
      r.lower === 1 &&
      r.upper === 1 &&
      r.indices.length === width &&
      r.values.every((v) => v === 1) &&
      (r.indices[0] ?? 0) > baseMax,
  )
  const first = row?.indices[0]
  if (first === undefined) throw new Error('期待値の拡張の先頭の列が見つからない')
  return first
}

function locate(ilp: IlpModel, targets: TargetSkill[]): Located {
  const thetaCol = ilp.damage?.thetaCol
  if (thetaCol === undefined) throw new Error('期待値のモデルでない')
  const sums = ilp.rows.filter(
    (r) => r.lower === 1 && r.upper === 1 && r.values.every((v) => v === 1),
  )
  const gCols = [...(sums.at(-1)?.indices ?? [])].sort((a, b) => a - b)
  const crits = targets.flatMap((t) => t.levels.map((l) => l.crit))
  const gValues = [
    BASE_CRIT_MULTIPLIER,
    ...[...new Set(crits.filter((v) => v > BASE_CRIT_MULTIPLIER))].sort((a, b) => a - b),
  ]
  if (gValues.length !== gCols.length) throw new Error('会心倍率の列の数が合わない')
  const wCols = gCols.map((g) =>
    ilp.rows
      .filter((r) => r.indices.length === 2 && r.indices.includes(g))
      .flatMap((r) => r.indices.filter((c) => c !== g && ilp.colInteger[c] === false)),
  )
  return { baseNum: findBaseNum(ilp, targets), gCols, gValues, wCols, thetaCol }
}

/** (a) g の列の上下限で、j 番目の候補だけを 1 に固定する */
function boundsSub(ilp: IlpModel, loc: Located, j: number): IlpModel {
  const colLower = [...ilp.colLower]
  const colUpper = [...ilp.colUpper]
  loc.gCols.forEach((col, k) => {
    colLower[col] = k === j ? 1 : 0
    colUpper[col] = k === j ? 1 : 0
  })
  return { ...ilp, colLower, colUpper }
}

const without = (row: Row, drop: ReadonlySet<number>): Row => {
  const keep = row.indices.map((c, k) => !drop.has(c) && k >= 0)
  return {
    lower: row.lower,
    upper: row.upper,
    indices: row.indices.filter((_, k) => keep[k]),
    values: row.values.filter((_, k) => keep[k]),
  }
}

/** j 番目の g の支持の行（g ≤ Σ y）を Σ y ≥ 1 にする。支持の行でなければ null */
function supportAsConstant(ilp: IlpModel, row: Row, gj: number, infinity: number): Row | null {
  const others = row.indices.filter((c) => c !== gj)
  const isSupport =
    row.lower <= -infinity &&
    row.upper === 0 &&
    row.indices.includes(gj) &&
    others.every((c) => ilp.colInteger[c] === true)
  if (!isSupport) return null
  const values = row.indices.flatMap((c, k) => (c === gj ? [] : [-(row.values[k] ?? 0)]))
  return { lower: 1, upper: infinity, indices: others, values }
}

/** (a) g と他の候補の積の列を持たないモデル。g_j = 1 を定数にする */
function rebuildSub(ilp: IlpModel, loc: Located, j: number, infinity: number): IlpModel {
  const gj = loc.gCols[j] ?? -1
  const dropCols = new Set([...loc.gCols, ...loc.wCols.filter((_, k) => k !== j).flat()])
  const rows: Row[] = []
  for (const row of ilp.rows) {
    if (!row.indices.some((c) => dropCols.has(c))) rows.push(row)
    else if (row.indices.includes(loc.thetaCol)) rows.push(without(row, dropCols))
    else {
      const support = supportAsConstant(ilp, row, gj, infinity)
      if (support !== null) rows.push(support)
    }
  }
  const map: number[] = []
  let next = 0
  for (let c = 0; c < ilp.numCols; c++) map.push(dropCols.has(c) ? -1 : next++)
  const keepCol = <T>(values: readonly T[]) => values.filter((_, c) => map[c] !== -1)
  const remap = (indices: number[]) => indices.map((c) => map[c] ?? -1)
  return {
    ...ilp,
    numCols: next,
    colCost: keepCol(ilp.colCost),
    colLower: keepCol(ilp.colLower),
    colUpper: keepCol(ilp.colUpper),
    colInteger: keepCol(ilp.colInteger),
    rows: rows.map((r) => ({ ...r, indices: remap(r.indices) })),
    damage: {
      thetaCol: map[loc.thetaCol] ?? -1,
      stage1Cost: keepCol(ilp.damage?.stage1Cost ?? []),
    },
  }
}

// ---------------------------------------------------------------- エンジン（enumerateDamage の写しの差し替え版）

function passModel(highs: Highs, model: Model, ilp: IlpModel, relax: boolean) {
  const { variableType, objectiveSense } = highs.constants
  const { numCols, rows } = ilp
  const starts: number[] = [0]
  for (const r of rows) starts.push((starts.at(-1) ?? 0) + r.indices.length)
  model.passModel({
    numCols,
    numRows: rows.length,
    sense: objectiveSense.maximize,
    colCost: relax ? (ilp.damage?.stage1Cost ?? ilp.colCost) : ilp.colCost,
    colLower: ilp.colLower,
    colUpper: ilp.colUpper,
    rowLower: rows.map((r) => r.lower),
    rowUpper: rows.map((r) => r.upper),
    matrix: {
      format: 'csr',
      numRows: rows.length,
      numCols,
      starts,
      indices: rows.flatMap((r) => r.indices),
      values: rows.flatMap((r) => r.values),
    },
    integrality: ilp.colInteger.map((integer) =>
      integer && !relax ? variableType.integer : variableType.continuous,
    ),
  })
}

interface SparseStart {
  indices: number[]
  values: number[]
}

interface Engine {
  highs: Highs
  model: Model
  master: MasterBundle
  request: SolverRequest
  weapon: ResolvedWeapon
  config: Config
  start: number
  exclusions: number[][]
  counts: { solves: number; lpSolves: number }
  initial?: SparseStart
}

interface RunSpec {
  /** true: θ → 空き Lv の重みの辞書式。false: 空き Lv の重みだけ */
  lex: boolean
  thetaLb?: number
  thetaUb?: number
}

interface RunOutcome {
  status: 'optimal' | 'timeout' | 'infeasible'
  colValue?: ArrayLike<number>
}

function setObjectives(model: Model, ilp: IlpModel, lex: boolean) {
  const slot = {
    weight: -1,
    offset: 0,
    coefficients: ilp.colCost,
    absoluteTolerance: 0,
    relativeTolerance: 0,
    priority: 5,
  }
  const theta = {
    weight: -1,
    offset: 0,
    coefficients: ilp.damage?.stage1Cost ?? [],
    absoluteTolerance: DAMAGE_EPSILON,
    relativeTolerance: 0,
    priority: 10,
  }
  model.passLinearObjectives(lex ? [theta, slot] : [slot])
}

function setOptions(e: Engine, remainingMs: number) {
  const { options } = e.model
  options.set('output_flag', false)
  options.set('mip_rel_gap', 0)
  options.set('mip_abs_gap', 0)
  options.set('presolve', 'off')
  options.set('mip_allow_restart', false)
  options.set('blend_multi_objectives', false)
  for (const [name, value] of Object.entries(e.config.options)) options.set(name, value)
  e.model.zeroAllClocks()
  options.set('time_limit', remainingMs / 1000)
}

function readStatus(e: Engine, modelStatus: number): RunOutcome['status'] {
  const { modelStatus: status } = e.highs.constants
  if (modelStatus === status.timeLimit) return 'timeout'
  if (modelStatus === status.infeasible || modelStatus === status.unboundedOrInfeasible) {
    return 'infeasible'
  }
  if (modelStatus !== status.optimal) throw new Error(`HiGHS の modelStatus=${modelStatus}`)
  return 'optimal'
}

/** モデルを渡し直して 1 回解く（除外の行・初期解・θ の上下限を足す） */
function runSub(e: Engine, ilp: IlpModel, spec: RunSpec): RunOutcome {
  const remaining = e.request.timeoutMs - (performance.now() - e.start)
  if (remaining <= 0) return { status: 'timeout' }
  const { highs, model } = e
  passModel(highs, model, ilp, false)
  setObjectives(model, ilp, spec.lex)
  const thetaCol = ilp.damage?.thetaCol ?? 0
  if (spec.thetaLb !== undefined || spec.thetaUb !== undefined) {
    model.changeColBounds(thetaCol, spec.thetaLb ?? 0, spec.thetaUb ?? highs.infinity)
  }
  for (const chosen of e.exclusions) {
    model.addRow(-highs.infinity, chosen.length - 1, {
      indices: chosen,
      values: chosen.map(() => 1),
    })
  }
  if (e.initial !== undefined) model.setSolution(e.initial)
  setOptions(e, remaining)
  e.counts.solves++
  const status = readStatus(e, model.run().modelStatus)
  return status === 'optimal' ? { status, colValue: model.getSolution().colValue } : { status }
}

/** 基本の ILP（期待値の拡張を持たない。空き Lv の重みの最大化）の解を、基本の列だけの初期解にする */
function baseStart(e: Engine, ilp: IlpModel, loc: Located): SparseStart | undefined {
  const n = loc.baseNum
  const base: IlpModel = {
    ...ilp,
    numCols: n,
    colCost: ilp.colCost.slice(0, n),
    colLower: ilp.colLower.slice(0, n),
    colUpper: ilp.colUpper.slice(0, n),
    colInteger: ilp.colInteger.slice(0, n),
    rows: ilp.rows.filter((r) => r.indices.every((c) => c < n)),
  }
  const { highs, model } = e
  passModel(highs, model, base, false)
  model.passLinearObjectives([])
  setOptions(e, e.request.timeoutMs)
  e.counts.solves++
  if (readStatus(e, model.run().modelStatus) !== 'optimal') return undefined
  const colValue = model.getSolution().colValue
  const indices = Array.from({ length: n }, (_, c) => c)
  return { indices, values: indices.map((c) => Math.round(colValue[c] ?? 0)) }
}

/** 部分問題の LP 緩和（θ だけの最大化）の上界。解なしは -Infinity */
function lpBound(e: Engine, ilp: IlpModel): number {
  const { highs, model } = e
  passModel(highs, model, ilp, true)
  model.clearLinearObjectives()
  model.options.set('output_flag', false)
  model.zeroAllClocks()
  e.counts.lpSolves++
  const status = readStatus(e, model.run().modelStatus)
  if (status !== 'optimal') return -Infinity
  return model.getSolution().colValue[ilp.damage?.thetaCol ?? 0] ?? -Infinity
}

interface Pick {
  sel: Selection
  build: SolvedBuild
  theta: number
  slot: number
}

function makePick(e: Engine, ilp: IlpModel, colValue: ArrayLike<number>): Pick {
  const sel = readSelection(ilp, colValue)
  const build = assembleBuild(e.master, e.weapon, sel, e.request.objective)
  build.score = evaluateDamage(
    e.master,
    e.weapon,
    build.skills,
    e.request.activeConditionIds,
  ).expectedDamage
  const slot = ilp.colCost.reduce((sum, c, i) => sum + c * (colValue[i] ?? 0), 0)
  return { sel, build, theta: colValue[ilp.damage?.thetaCol ?? 0] ?? 0, slot }
}

const scoreOf = (p: Pick) => p.build.score ?? 0

/** 1 件の探索の結果。timeout は時間切れ、none はもう構成が無い */
type Step = { kind: 'ok'; pick: Pick } | { kind: 'timeout' } | { kind: 'none' }

/** 分解しない（現行の写し。ub・init・設定の差し替えを足せる） */
async function stepWhole(e: Engine, ilp: IlpModel, previous: Pick | undefined): Promise<Step> {
  const ub =
    e.config.ub && previous !== undefined ? previous.theta + boundMargin(previous.theta) : undefined
  const out = runSub(e, ilp, { lex: true, ...(ub !== undefined && { thetaUb: ub }) })
  if (out.status === 'timeout') return { kind: 'timeout' }
  if (out.colValue === undefined) return { kind: 'none' }
  return { kind: 'ok', pick: makePick(e, ilp, out.colValue) }
}

const boundMargin = (value: number) => 1e-6 + 1e-7 * Math.abs(value)

interface SubState {
  ilp: IlpModel
  /** この部分問題の θ の上界。解を持つときはその θ */
  bound: number
  pick?: Pick
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((c) => b.includes(c))

/** 部分問題 1 つを解き、最適解か、(解なし) 上界を更新する。時間切れなら false */
function solveSub(e: Engine, sub: SubState, best: number): boolean {
  const lb = e.config.lb && best > -Infinity ? best - DAMAGE_EPSILON : undefined
  const ub =
    e.config.ub && Number.isFinite(sub.bound) ? sub.bound + boundMargin(sub.bound) : undefined
  const out = runSub(e, sub.ilp, {
    lex: true,
    ...(lb !== undefined && { thetaLb: lb }),
    ...(ub !== undefined && { thetaUb: ub }),
  })
  if (out.status === 'timeout') return false
  if (out.colValue === undefined) {
    sub.pick = undefined
    // 下限の行で解なしになったなら、この部分問題の最大は下限より小さいだけ（除外が増えると下限は下がる）
    sub.bound = lb === undefined ? -Infinity : lb - 1e-9
    return true
  }
  sub.pick = makePick(e, sub.ilp, out.colValue)
  sub.bound = sub.pick.theta
  return true
}

/** 上界が最良の期待値 − ε 以上で、まだ解いていない部分問題のうち、上界が最大のもの */
function nextToSolve(subs: SubState[], best: number): SubState | undefined {
  return subs
    .filter((s) => s.pick === undefined && s.bound > -Infinity && s.bound >= best - DAMAGE_EPSILON)
    .sort((x, y) => y.bound - x.bound)[0]
}

const bestScore = (subs: SubState[]) =>
  Math.max(-Infinity, ...subs.flatMap((s) => (s.pick === undefined ? [] : [scoreOf(s.pick)])))

/**
 * θ が最大の部分問題の ε 以内の部分問題から、空き Lv の重みが最大の解を選ぶ。
 * θ が最大より小さい部分問題は、θ ≥ 最大 − ε の下限の下で空き Lv の重みだけ解き直す
 * （部分問題の中の許容差の基準が自分の θ なので、そのままでは最大 − ε を下回る構成を拾いうる）。
 */
function chooseTied(e: Engine, subs: SubState[]): Step {
  const solved = subs.flatMap((s) => (s.pick === undefined ? [] : [{ sub: s, pick: s.pick }]))
  const thetaBest = Math.max(...solved.map((s) => s.pick.theta))
  const candidates: Pick[] = []
  for (const { sub, pick } of solved) {
    if (pick.theta < thetaBest - DAMAGE_EPSILON) continue
    if (pick.theta >= thetaBest - NOISE) {
      candidates.push(pick)
      continue
    }
    const out = runSub(e, sub.ilp, { lex: false, thetaLb: thetaBest - DAMAGE_EPSILON })
    if (out.status === 'timeout') return { kind: 'timeout' }
    if (out.colValue !== undefined) candidates.push(makePick(e, sub.ilp, out.colValue))
  }
  const winner = candidates.reduce<Pick | undefined>(
    (acc, p) => (acc === undefined || p.slot > acc.slot ? p : acc),
    undefined,
  )
  return winner === undefined ? { kind: 'none' } : { kind: 'ok', pick: winner }
}

function stepSplit(e: Engine, subs: SubState[]): Step {
  for (;;) {
    const best = bestScore(subs)
    const todo = nextToSolve(subs, best)
    if (todo === undefined) break
    if (!solveSub(e, todo, best)) return { kind: 'timeout' }
  }
  return subs.some((s) => s.pick !== undefined) ? chooseTied(e, subs) : { kind: 'none' }
}

/** 選んだ組を除外し、同じ組を解に持つ部分問題の解を無効にする（他の部分問題の解は除外の後も最適） */
function excludeChosen(e: Engine, subs: SubState[], chosen: number[]) {
  e.exclusions.push(chosen)
  for (const s of subs) {
    if (s.pick !== undefined && sameSet(s.pick.sel.chosen, chosen)) s.pick = undefined
  }
}

interface Outcome {
  scores: number[]
  firstMs: number | undefined
  totalMs: number
  solves: number
  lpSolves: number
  status: SolverStatus
}

async function prepareSubs(e: Engine, ilp: IlpModel, targets: TargetSkill[]): Promise<SubState[]> {
  const loc = locate(ilp, targets)
  if (e.config.init) e.initial = baseStart(e, ilp, loc)
  const infinity = e.highs.infinity
  const make = (j: number) =>
    e.config.split === 'bounds' ? boundsSub(ilp, loc, j) : rebuildSub(ilp, loc, j, infinity)
  const subs = loc.gCols.map((_, j): SubState => ({ ilp: make(j), bound: Infinity }))
  for (const s of subs) s.bound = lpBound(e, s.ilp)
  return subs
}

async function solveProto(
  highs: Highs,
  baseMaster: MasterBundle,
  baseRequest: SolverRequest,
  config: Config,
): Promise<Outcome> {
  const start = performance.now()
  const counts = { solves: 0, lpSolves: 0 }
  const scores: number[] = []
  let firstMs: number | undefined
  let status = 'optimal' as SolverStatus
  const { master, request } = config.dominance
    ? reduceCandidates(baseMaster, baseRequest)
    : { master: baseMaster, request: baseRequest }
  const weapon = validateRequest(master, request)
  const ilp = buildModel(master, request, weapon, highs.infinity)
  if (ilp === null) status = 'infeasible'
  else {
    await highs.withModel(async (model) => {
      const e: Engine = {
        highs,
        model,
        master,
        request,
        weapon,
        config,
        start,
        exclusions: [],
        counts,
      }
      const targets = damageTargets(master, request)
      const subs = config.split === 'none' ? [] : await prepareSubs(e, ilp, targets)
      if (config.split === 'none' && config.init)
        e.initial = baseStart(e, ilp, locate(ilp, targets))
      let previous: Pick | undefined
      while (scores.length < request.maxResults) {
        const step =
          config.split === 'none' ? await stepWhole(e, ilp, previous) : stepSplit(e, subs)
        if (step.kind === 'timeout') {
          status = 'timeout'
          break
        }
        if (step.kind === 'none') break
        firstMs ??= performance.now() - start
        scores.push(scoreOf(step.pick))
        previous = step.pick
        if (step.pick.sel.chosen.length === 0) break
        excludeChosen(e, subs, step.pick.sel.chosen)
      }
    })
    if (scores.length === 0 && status !== 'timeout') status = 'infeasible'
  }
  return { scores, firstMs, totalMs: performance.now() - start, ...counts, status }
}

// ---------------------------------------------------------------- 現行の実装

async function solveCurrent(
  highs: Highs,
  master: MasterBundle,
  request: SolverRequest,
): Promise<Outcome> {
  let solves = 0
  const timed = new Proxy(highs, {
    get(h, prop) {
      const value: unknown = Reflect.get(h, prop, h)
      if (prop === 'withModel' && typeof value === 'function') {
        return (operation: (model: object) => unknown) =>
          value.call(h, (model: object) =>
            operation(
              new Proxy(model, {
                get(m, p) {
                  const v: unknown = Reflect.get(m, p, m)
                  if (p === 'run' && typeof v === 'function') {
                    return (...args: unknown[]) => {
                      solves++
                      return v.apply(m, args)
                    }
                  }
                  return typeof v === 'function' ? v.bind(m) : v
                },
              }),
            ),
          )
      }
      return typeof value === 'function' ? value.bind(h) : value
    },
  })
  let firstMs: number | undefined
  const start = performance.now()
  const result = await solveBuilds(timed, master, request, {
    now: () => performance.now(),
    yieldControl: () => new Promise<void>((resolve) => setImmediate(resolve)),
    onProgress: () => {
      firstMs ??= performance.now() - start
    },
  })
  return {
    scores: result.builds.map((b) => b.score ?? 0),
    firstMs,
    totalMs: performance.now() - start,
    solves,
    lpSolves: 0,
    status: result.status,
  }
}

// ---------------------------------------------------------------- 測定と表

interface Row2 {
  candidate: string
  crafted: boolean
  caseId: string
  run: number
  out: Outcome
  firstMatch: string
  listMatch: string
}

let highs: Highs
let master: MasterBundle
const rows2: Row2[] = []
const baselines = new Map<string, Outcome>()

function plainWeaponId() {
  const found = master.weapons.find((w) => w.skills.length === 0 && w.setBonusIds.length === 0)
  if (found === undefined) throw new Error('スキルを持たないマスターの武器が無い')
  return found.id
}

function requestOf(testCase: Case, crafted: boolean): SolverRequest {
  return makeRequest(master, {
    weapon: { kind: 'master', weaponId: plainWeaponId() },
    charms: crafted ? topRankCraftedCharms(master) : [],
    required: testCase.required.map(([id, level]) => skill(id, level)),
    objective: { kind: 'maximize', metric: 'expectedDamage' },
    activeConditionIds: master.conditions.map((c) => c.id),
    maxResults: MAX_RESULTS,
    timeoutMs: TIMEOUT_MS,
  })
}

const near = (a: number, b: number) => Math.abs(a - b) <= DAMAGE_EPSILON

function compare(base: Outcome, out: Outcome): { first: string; list: string } {
  const a = base.scores[0]
  const b = out.scores[0]
  if (a === undefined || b === undefined) {
    return { first: a === b ? 'ok(なし)' : 'NG', list: a === b ? 'ok(なし)' : 'NG' }
  }
  const n = Math.min(base.scores.length, out.scores.length)
  const prefix = base.scores.slice(0, n).every((v, i) => near(v, out.scores[i] ?? NaN))
  const sameLength = base.scores.length === out.scores.length
  const partial = base.status === 'timeout' || out.status === 'timeout'
  let list = 'NG'
  if (prefix && sameLength) list = 'ok'
  else if (prefix && partial) list = `ok*(${n}件)`
  return { first: near(a, b) ? 'ok' : 'NG', list }
}

async function baselineOf(testCase: Case, crafted: boolean): Promise<Outcome> {
  const key = `${crafted}|${testCase.id}`
  const cached = baselines.get(key)
  if (cached !== undefined) return cached
  const out = await solveCurrent(highs, master, requestOf(testCase, crafted))
  baselines.set(key, out)
  return out
}

async function measure(candidate: string, testCase: Case, crafted: boolean, run: number) {
  const config = parseConfig(candidate)
  const request = requestOf(testCase, crafted)
  const out =
    config === 'current'
      ? await solveCurrent(highs, master, request)
      : await solveProto(highs, master, request, config)
  if (config === 'current' && !baselines.has(`${crafted}|${testCase.id}`)) {
    baselines.set(`${crafted}|${testCase.id}`, out)
  }
  const base = await baselineOf(testCase, crafted)
  const { first, list } = config === 'current' ? { first: '-', list: '-' } : compare(base, out)
  const row: Row2 = {
    candidate,
    crafted,
    caseId: testCase.id,
    run,
    out,
    firstMatch: first,
    listMatch: list,
  }
  rows2.push(row)
  console.log(
    `[proto] ${candidate} crafted=${crafted} ${testCase.id} #${run}: status=${out.status} builds=${out.scores.length} first=${out.firstMs?.toFixed(0) ?? '-'}ms total=${out.totalMs.toFixed(0)}ms solves=${out.solves} lp=${out.lpSolves} first=${first} list=${list}`,
  )
}

const maxOf = (values: number[]) => Math.max(0, ...values)
const fmt = (ms: number) => ms.toFixed(0)

/** 解なしの回は、結果が分かるまでの時間（合計）を 1 件目までの時間として数える（solveBuilds.measure.ts と同じ） */
const firstOrTotal = (o: Outcome) => o.firstMs ?? o.totalMs

function summaryRow(group: Row2[], caseId: string): string {
  const rs = group.filter((r) => r.caseId === caseId)
  const statuses = [...new Set(rs.map((r) => r.out.status))].join('/')
  const builds = [...new Set(rs.map((r) => r.out.scores.length))].join('/')
  const first = [...new Set(rs.map((r) => r.firstMatch))].join('/')
  const list = [...new Set(rs.map((r) => r.listMatch))].join('/')
  const cols = [
    caseId,
    fmt(maxOf(rs.map((r) => firstOrTotal(r.out)))),
    fmt(maxOf(rs.map((r) => r.out.totalMs))),
    String(maxOf(rs.map((r) => r.out.solves))) +
      (rs.some((r) => r.out.lpSolves > 0) ? `+LP${maxOf(rs.map((r) => r.out.lpSolves))}` : ''),
    `${statuses} ${builds}件`,
    first,
    list,
  ]
  return `| ${cols.join(' | ')} |`
}

function report() {
  const lines: string[] = [`測定回数: ${Math.max(...rows2.map((r) => r.run))}（各ケースの最大）`]
  const keys = [...new Set(rows2.map((r) => `${r.candidate}|${r.crafted}`))]
  for (const crafted of [true, false]) {
    lines.push('', `### 生産護石${crafted ? 'オン' : 'オフ'}`, '')
    lines.push(
      '| 候補 | ケース | 1件目max(ms) | 合計max(ms) | 求解回数 | 状態・件数 | 1件目一致 | 10件列一致 |',
    )
    lines.push('|---|---|---|---|---|---|---|---|')
    for (const key of keys.filter((k) => k.endsWith(`|${crafted}`))) {
      const group = rows2.filter((r) => `${r.candidate}|${r.crafted}` === key)
      const caseIds = [...new Set(group.map((r) => r.caseId))]
      for (const id of caseIds)
        lines.push(summaryRow(group, id).replace('| ', `| ${group[0]?.candidate} | `))
      const overall = maxOf(group.map((r) => firstOrTotal(r.out)))
      lines.push(
        `| ${group[0]?.candidate} | **全ケースの1件目max** | **${fmt(overall)}** | | | | | |`,
      )
    }
  }
  console.log(lines.join('\n'))
}

function envList(name: string): string[] | undefined {
  const value = process.env[name]
  return value === undefined || value === '' ? undefined : value.split(',').map((s) => s.trim())
}

const candidates = envList('PROTO_CANDIDATES') ?? DEFAULT_CANDIDATES
const caseIds = envList('PROTO_CASES') ?? CASES.map((c) => c.id)
const craftedMode = process.env.PROTO_CRAFTED ?? 'both'
const repeats = Number(process.env.PROTO_REPEATS ?? '1')
const craftedList = [
  craftedMode === 'off' ? [] : [true],
  craftedMode === 'on' ? [] : [false],
].flat()
const selectedCases = CASES.filter((c) => caseIds.includes(c.id))

const entries = candidates.flatMap((candidate) =>
  craftedList.flatMap((crafted) =>
    selectedCases.map((testCase) => ({
      name: `${candidate} ${crafted ? 'crafted-on' : 'crafted-off'} ${testCase.id}`,
      candidate,
      crafted,
      testCase,
    })),
  ),
)

describe('expectedDamage の求解方式の試作（実データ）', () => {
  beforeAll(async () => {
    highs = await highsLoader()
    master = loadRealMaster()
  })

  afterAll(() => {
    if (rows2.length > 0) report()
  })

  it.each(entries)('$name', async ({ candidate, crafted, testCase }) => {
    for (let run = 1; run <= repeats; run++) await measure(candidate, testCase, crafted, run)
  })
})

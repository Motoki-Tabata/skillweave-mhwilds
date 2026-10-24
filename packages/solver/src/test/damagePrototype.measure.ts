/**
 * 機能 019 plan D1・D2: 期待値の求解の方式の試作と測定。CI では実行しない。`src/main` は変えない。
 * 本実装（T4）で削除する。
 *
 * 実行（リポジトリ直下）:
 *   PROTO_CONFIGS=a-both+e2 PROTO_CASES="k=3 解あり" \
 *     pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false \
 *     src/test/damagePrototype.measure.ts
 *   PROTO_CONFIGS は CONFIGS の name の完全一致（カンマ区切り。省略は全方式）、PROTO_CASES はケース名の部分一致。
 *   PROTO_REPEATS は各ケースの回数（既定 3）。ファイルを指定しないと solveBuilds.measure.ts も走る。
 *   （vitest の -t は空白を含む名前に合わないことがあるため使わない）
 * 1 回の求解が 60 秒を超えたケースは打ち切り（status が timeout）として表に出す。
 */
import type { Highs, Model } from 'highs'
import highsLoader from 'highs'
import type { ArmorPart, MasterArmor, MasterBundle, MasterDecoration, SkillId } from '@swv/data'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { evaluateDamage } from '../main/damage'
import { damageTargets } from '../main/damageModel'
import { buildModel, readSelection, type IlpModel } from '../main/model'
import { assembleBuild } from '../main/placement'
import type { SolvedBuild, SolverRequest } from '../main/request'
import { findSetBonus, isSetSkill, skillLevelOf } from '../main/skills'
import { DAMAGE_EPSILON, solveBuilds } from '../main/solveBuilds'
import { validateRequest } from '../main/validate'
import { makeRequest, skill } from './support/builders'
import { loadRealMaster } from './support/realMaster'

const TIMEOUT_MS = 60_000
const MAX_RESULTS = 10
const REPEATS = Number(process.env.PROTO_REPEATS ?? 3)
const BITS = 7

// 006 の測定（solveBuilds.measure.ts）と同じ必須スキル
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
type Pair = [string, number]
interface Case {
  label: string
  required: Pair[]
  expected: 'optimal' | 'infeasible'
}
const CASES: Case[] = [
  {
    label: 'k=3 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
    ],
    expected: 'optimal',
  },
  {
    label: 'k=3 解なし',
    required: [
      [SK.fire, 2],
      [SK.evade, 5],
      [SK.challenger, 5],
    ],
    expected: 'infeasible',
  },
  {
    label: 'k=6 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
      [SK.evade, 3],
      [SK.challenger, 3],
      [SK.weak, 3],
    ],
    expected: 'optimal',
  },
  {
    label: 'k=6 解なし',
    required: [
      [SK.fire, 2],
      [SK.taijutsu, 4],
      [SK.evade, 4],
      [SK.challenger, 4],
      [SK.weak, 4],
      [SK.grudge, 3],
    ],
    expected: 'infeasible',
  },
  {
    label: 'k=10 解あり',
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
    expected: 'optimal',
  },
  {
    label: 'k=10 解なし',
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
    expected: 'infeasible',
  },
]

/** 候補の指定。a は HiGHS の設定、b 以降は plan D1 の記号に対応 */
interface Config {
  name: string
  presolveOff?: boolean
  noRestart?: boolean
  /** (b) 支配される防具・装飾品を外す */
  dominance?: boolean
  /** (c) 2 件目以降に θ ≤ E_prev + ε */
  cap?: boolean
  /** (d) 会心倍率の候補ごとに攻撃力を分ける */
  tightM?: boolean
  /** (e1) 1 段目の解を 2 段目の初期解に渡す */
  warmStage2?: boolean
  /** (e2) passLinearObjectives で 1 回にまとめる */
  multi?: boolean
  /** (f1) 前の件の求解の過程で得た次善の解を次の件の初期解に渡す */
  nextBest?: boolean
  /** (f2) mip_heuristic_effort */
  heuristic?: number
}

const A_BOTH = { presolveOff: true, noRestart: true }
const CONFIGS: Config[] = [
  { name: 'base' },
  { name: 'a-presolve', presolveOff: true },
  { name: 'a-restart', noRestart: true },
  { name: 'a-both', ...A_BOTH },
  { name: 'b', dominance: true },
  { name: 'c', cap: true },
  { name: 'd', tightM: true },
  { name: 'e1', warmStage2: true },
  { name: 'e2', multi: true },
  { name: 'f1', nextBest: true },
  { name: 'f2', heuristic: 0.3 },
  { name: 'a-both+b', ...A_BOTH, dominance: true },
  { name: 'a-both+c', ...A_BOTH, cap: true },
  { name: 'a-both+d', ...A_BOTH, tightM: true },
  { name: 'a-both+b+c', ...A_BOTH, dominance: true, cap: true },
  { name: 'a-both+b+d', ...A_BOTH, dominance: true, tightM: true },
  { name: 'a-both+b+c+d', ...A_BOTH, dominance: true, cap: true, tightM: true },
  { name: 'a-both+b+c+e1', ...A_BOTH, dominance: true, cap: true, warmStage2: true },
  { name: 'a-both+b+c+f1', ...A_BOTH, dominance: true, cap: true, nextBest: true },
  {
    name: 'a-both+b+c+d+e1+f1',
    ...A_BOTH,
    dominance: true,
    cap: true,
    tightM: true,
    warmStage2: true,
    nextBest: true,
  },
  { name: 'a-both+c+e2', ...A_BOTH, cap: true, multi: true },
  { name: 'a-both+e2', ...A_BOTH, multi: true },
  { name: 'a-both+b+e2', ...A_BOTH, dominance: true, multi: true },
  { name: 'a-both+b+c+e2', ...A_BOTH, dominance: true, cap: true, multi: true },
  { name: 'a-both+b+c+d+e2', ...A_BOTH, dominance: true, cap: true, tightM: true, multi: true },
]

// 絞り込み（vitest の -t は空白を含む名前に合いにくいため環境変数で絞る）。
// PROTO_CONFIGS=a-both,a-both+b（方式名の完全一致）、PROTO_CASES=k=3（ケース名の部分一致）。カンマ区切り
const configFilter = process.env.PROTO_CONFIGS?.split(',')
const caseFilter = process.env.PROTO_CASES?.split(',')
const SELECTED_CONFIGS = CONFIGS.filter((c) => configFilter?.includes(c.name) ?? true)
const SELECTED_CASES = CASES.filter((c) => caseFilter?.some((f) => c.label.includes(f)) ?? true)

// ---------------------------------------------------------------- (b) 支配

type SlotLists = Record<'weapon' | 'armor', number[]>

function slotLists(slots: readonly { target: 'weapon' | 'armor'; level: number }[]): SlotLists {
  const lists: SlotLists = { weapon: [], armor: [] }
  for (const s of slots) lists[s.target].push(s.level)
  lists.weapon.sort((x, y) => y - x)
  lists.armor.sort((x, y) => y - x)
  return lists
}

function slotsLeq(x: number[], y: number[]): boolean {
  return x.every((level, i) => level <= (y[i] ?? 0))
}

interface Relevant {
  ordinary: SkillId[]
  bonusIds: string[]
}

function relevantSkills(master: MasterBundle, request: SolverRequest): Relevant {
  const ordinary = new Set<SkillId>()
  const bonusIds = new Set<string>()
  const add = (id: SkillId, set: boolean) => {
    if (!set) ordinary.add(id)
    else {
      const bonus = findSetBonus(master, id)
      if (bonus !== undefined) bonusIds.add(bonus.id)
    }
  }
  for (const r of request.required) {
    add(r.skillId, isSetSkill(master.skills.find((s) => s.id === r.skillId)))
  }
  for (const t of damageTargets(master, request)) add(t.skill.id, t.bonus !== undefined)
  return { ordinary: [...ordinary], bonusIds: [...bonusIds] }
}

function armorDominates(rel: Relevant, y: MasterArmor, x: MasterArmor): boolean {
  if (!rel.ordinary.every((id) => skillLevelOf(x.skills, id) <= skillLevelOf(y.skills, id))) {
    return false
  }
  const ySets = new Set<string>(y.setBonusIds)
  const xRel = x.setBonusIds.filter((b) => rel.bonusIds.includes(b))
  if (!xRel.every((b) => ySets.has(b))) return false
  const xs = slotLists(x.slots)
  const ys = slotLists(y.slots)
  return slotsLeq(xs.weapon, ys.weapon) && slotsLeq(xs.armor, ys.armor)
}

function decoDominates(rel: Relevant, y: MasterDecoration, x: MasterDecoration): boolean {
  return (
    x.target === y.target &&
    x.slotLevel >= y.slotLevel &&
    rel.ordinary.every((id) => skillLevelOf(x.skills, id) <= skillLevelOf(y.skills, id))
  )
}

/** x が除かれる: 別の y に支配され、互いに支配し合うときは並びが後のほうを除く */
function removeDominated<T>(items: T[], dominates: (y: T, x: T) => boolean): T[] {
  return items.filter((x, xi) =>
    items.every((y, yi) => {
      if (yi === xi || !dominates(y, x)) return true
      return dominates(x, y) && xi < yi
    }),
  )
}

function dominanceFilter(master: MasterBundle, request: SolverRequest): MasterBundle {
  const rel = relevantSkills(master, request)
  const armors: MasterArmor[] = []
  for (const part of ['head', 'chest', 'arms', 'waist', 'legs'] as ArmorPart[]) {
    const same = master.armors.filter((a) => a.part === part)
    armors.push(...removeDominated(same, (y, x) => armorDominates(rel, y, x)))
  }
  const keep = new Set(armors.map((a) => a.id))
  return {
    ...master,
    armors: master.armors.filter((a) => keep.has(a.id)),
    decorations: removeDominated(master.decorations, (y, x) => decoDominates(rel, y, x)),
  }
}

// ---------------------------------------------------------------- (d) 定式化の強化

/**
 * extendWithDamage の結果に、会心倍率の候補ごとの攻撃力 A_j を足す（A = ΣA_j、A_j ≤ 上界·g_j、w(j,b) ≤ A_j）。
 * 列の並び（w(j,b) が j・b の順、その後ろに v、最後が θ）と、θ の定義の行が最後であることに頼る。
 */
function tightenCritBigM(ilp: IlpModel): IlpModel {
  const damage = ilp.damage
  if (damage === undefined) return ilp
  const thetaRow = ilp.rows.at(-1)
  if (thetaRow === undefined) throw new Error('θ の行が無い')
  const attackCol = thetaRow.indices[1] ?? -1
  const terms = thetaRow.indices.slice(2)
  const ws = terms.slice(0, terms.length - BITS)
  const upper = ilp.colUpper[attackCol] ?? 0
  const groups = ws.length / BITS
  const gCols: number[] = []
  for (let j = 0; j < groups; j++) {
    const w = ws[j * BITS] ?? -1
    const r = ilp.rows.findIndex((row) => row.indices[0] === w)
    const gRow = ilp.rows[r + 2]
    gCols.push(gRow?.indices[1] ?? -1)
  }
  const aCols = gCols.map((_, j) => ilp.numCols + j)
  const numCols = ilp.numCols + groups
  const extra = (value: number) => Array.from({ length: groups }, () => value)
  const rows = [...ilp.rows]
  rows.push({
    lower: 0,
    upper: 0,
    indices: [attackCol, ...aCols],
    values: [1, ...aCols.map(() => -1)],
  })
  gCols.forEach((g, j) => {
    rows.push({
      lower: -Infinity,
      upper: 0,
      indices: [aCols[j] ?? 0, g],
      values: [1, -upper],
    })
    for (let b = 0; b < BITS; b++) {
      rows.push({
        lower: -Infinity,
        upper: 0,
        indices: [ws[j * BITS + b] ?? 0, aCols[j] ?? 0],
        values: [1, -1],
      })
    }
  })
  return {
    ...ilp,
    numCols,
    colCost: [...ilp.colCost, ...extra(0)],
    colLower: [...ilp.colLower, ...extra(0)],
    colUpper: [...ilp.colUpper, ...extra(upper)],
    colInteger: [...ilp.colInteger, ...extra(0).map(() => false)],
    rows,
    damage: { ...damage, stage1Cost: [...damage.stage1Cost, ...extra(0)] },
  }
}

// ---------------------------------------------------------------- 求解

interface ProtoResult {
  status: 'optimal' | 'infeasible' | 'timeout'
  scores: number[]
  /** 構成の識別（防具と護石の組） */
  keys: string[]
  totalMs: number
  firstMs: number | undefined
  solves: number
}

function passModel(highs: Highs, model: Model, ilp: IlpModel, cost: number[]) {
  const starts: number[] = [0]
  for (const r of ilp.rows) starts.push((starts.at(-1) ?? 0) + r.indices.length)
  model.passModel({
    numCols: ilp.numCols,
    numRows: ilp.rows.length,
    sense: highs.constants.objectiveSense.maximize,
    colCost: cost,
    colLower: ilp.colLower,
    colUpper: ilp.colUpper,
    rowLower: ilp.rows.map((r) => r.lower),
    rowUpper: ilp.rows.map((r) => r.upper),
    matrix: {
      format: 'csr',
      numRows: ilp.rows.length,
      numCols: ilp.numCols,
      starts,
      indices: ilp.rows.flatMap((r) => r.indices),
      values: ilp.rows.flatMap((r) => r.values),
    },
    integrality: ilp.colInteger.map((i) =>
      i ? highs.constants.variableType.integer : highs.constants.variableType.continuous,
    ),
  })
}

interface Incumbent {
  values: Float64Array
  theta: number
}

function protoSolve(
  highs: Highs,
  full: MasterBundle,
  request: SolverRequest,
  cfg: Config,
): ProtoResult {
  const start = performance.now()
  const deadline = start + request.timeoutMs
  const weapon = validateRequest(full, request)
  const master = cfg.dominance === true ? dominanceFilter(full, request) : full
  let ilp = buildModel(master, request, weapon, highs.infinity)
  const scores: number[] = []
  const keys: string[] = []
  let firstMs: number | undefined
  let solves = 0
  const finish = (status: ProtoResult['status']): ProtoResult => ({
    status,
    scores,
    keys,
    totalMs: performance.now() - start,
    firstMs,
    solves,
  })
  if (ilp === null) return finish('infeasible')
  if (cfg.tightM === true) ilp = tightenCritBigM(ilp)
  const model0 = ilp
  const damage = model0.damage
  if (damage === undefined) throw new Error('期待値の列が無い')
  const mdl = ilp

  const toBuild = (sel: ReturnType<typeof readSelection>): SolvedBuild & { e: number } => {
    const build = assembleBuild(master, weapon, sel, request.objective)
    const e = evaluateDamage(
      master,
      weapon,
      build.skills,
      request.activeConditionIds,
    ).expectedDamage
    return Object.assign(build, { e })
  }
  const keyOf = (sel: ReturnType<typeof readSelection>) => sel.chosen.join(',')

  const result = highs.withModel((model): ProtoResult => {
    model.options.set('output_flag', false)
    model.options.set('mip_rel_gap', 0)
    model.options.set('mip_abs_gap', 0)
    if (cfg.presolveOff === true) model.options.set('presolve', 'off')
    if (cfg.noRestart === true) model.options.set('mip_allow_restart', false)
    if (cfg.heuristic !== undefined) model.options.set('mip_heuristic_effort', cfg.heuristic)
    passModel(highs, model, mdl, mdl.colCost)
    if (cfg.multi === true) {
      // モデル本体の目的は元の重み（同点の順）。θ を優先度の高い補助の目的として足す（weight 負 = 最大化）
      model.passLinearObjectives([
        {
          weight: -1,
          offset: 0,
          coefficients: damage.stage1Cost,
          absoluteTolerance: DAMAGE_EPSILON,
          relativeTolerance: 0,
          priority: 10,
        },
      ])
    }
    const all = { kind: 'range', from: 0, to: mdl.numCols - 1 } as const
    let capRow = -1
    let rowCount = mdl.rows.length
    if (cfg.cap === true) {
      model.addRow(-highs.infinity, highs.infinity, { indices: [damage.thetaCol], values: [1] })
      capRow = rowCount
      rowCount++
    }
    let pool: Incumbent[] = []
    const used = new Set<string>()
    const run = (collect: boolean): 'optimal' | 'timeout' | 'infeasible' => {
      const remaining = deadline - performance.now()
      if (remaining <= 0) return 'timeout'
      model.zeroAllClocks()
      model.options.set('time_limit', remaining / 1000)
      solves++
      const callbacks = collect
        ? {
            [highs.constants.callbackType.mipImprovingSolution]: (event: {
              data: { mip_solution?: Float64Array }
            }) => {
              const values = event.data.mip_solution
              if (values !== undefined) {
                pool.push({ values, theta: values[damage.thetaCol] ?? 0 })
              }
              return undefined
            },
          }
        : undefined
      const { modelStatus } = callbacks === undefined ? model.run() : model.run(callbacks)
      const st = highs.constants.modelStatus
      if (modelStatus === st.timeLimit) return 'timeout'
      if (modelStatus === st.infeasible || modelStatus === st.unboundedOrInfeasible) {
        return 'infeasible'
      }
      if (modelStatus !== st.optimal) throw new Error(`modelStatus=${modelStatus}`)
      return 'optimal'
    }

    while (scores.length < request.maxResults) {
      if (cfg.nextBest === true && pool.length > 0) {
        const usable = pool
          .filter((p) => !used.has(keyOf(readSelection(mdl, p.values))))
          .sort((p, q) => q.theta - p.theta)[0]
        if (usable !== undefined) model.setSolution({ colValue: usable.values })
      }
      pool = []
      if (cfg.multi === true) {
        // 1 回で θ 最大 → 空き Lv の重み最大
        const r = run(false)
        if (r === 'timeout') return finish('timeout')
        if (r === 'infeasible') break
        const sel = readSelection(mdl, model.getSolution().colValue)
        const build = toBuild(sel)
        scores.push(build.e)
        keys.push(keyOf(sel))
        firstMs ??= performance.now() - start
        used.add(keyOf(sel))
        if (capRow >= 0) model.changeRowBounds(capRow, -highs.infinity, build.e + DAMAGE_EPSILON)
        if (sel.chosen.length === 0) break
        model.addRow(-highs.infinity, sel.chosen.length - 1, {
          indices: sel.chosen,
          values: sel.chosen.map(() => 1),
        })
        rowCount++
        continue
      }
      model.changeColsCost(all, damage.stage1Cost)
      const first = run(cfg.nextBest === true)
      if (first === 'timeout') return finish('timeout')
      if (first === 'infeasible') break
      const sol1 = model.getSolution().colValue
      const sel1 = readSelection(mdl, sol1)
      const b1 = toBuild(sel1)
      const e1 = b1.e

      model.addRow(e1 - DAMAGE_EPSILON, highs.infinity, { indices: [damage.thetaCol], values: [1] })
      rowCount++
      model.changeColsCost(all, mdl.colCost)
      if (cfg.warmStage2 === true) model.setSolution({ colValue: sol1 })
      const second = run(false)
      if (second === 'timeout') return finish('timeout')
      // 2 段目が解なしなら 1 段目の構成を返す（019 D4）
      const sel = second === 'infeasible' ? sel1 : readSelection(mdl, model.getSolution().colValue)
      const build = second === 'infeasible' ? b1 : toBuild(sel)
      scores.push(build.e)
      keys.push(keyOf(sel))
      used.add(keyOf(sel))
      firstMs ??= performance.now() - start

      model.deleteRows({ kind: 'range', from: rowCount - 1, to: rowCount - 1 })
      rowCount--
      if (capRow >= 0) model.changeRowBounds(capRow, -highs.infinity, e1 + DAMAGE_EPSILON)
      if (sel.chosen.length === 0) break
      model.addRow(-highs.infinity, sel.chosen.length - 1, {
        indices: sel.chosen,
        values: sel.chosen.map(() => 1),
      })
      rowCount++
    }
    return finish(scores.length === 0 ? 'infeasible' : 'optimal')
  })
  return result
}

// ---------------------------------------------------------------- 測定

interface Reference {
  scores: number[]
  keys: string[]
}

interface Row {
  config: string
  case: string
  status: string
  totalMax: number
  firstMax: number
  solves: number
  builds: number
  firstEqual: boolean
  listEqual: boolean
}

let highs: Highs
let master: MasterBundle
const rows: Row[] = []
const references = new Map<string, Reference>()

function plainWeaponId() {
  const found = master.weapons.find((w) => w.skills.length === 0 && w.setBonusIds.length === 0)
  if (found === undefined) throw new Error('スキルを持たないマスターの武器が無い')
  return found.id
}

function requestOf(c: Case): SolverRequest {
  return makeRequest(master, {
    weapon: { kind: 'master', weaponId: plainWeaponId() },
    required: c.required.map(([id, level]) => skill(id, level)),
    objective: { kind: 'maximize', metric: 'expectedDamage' },
    activeConditionIds: master.conditions.map((x) => x.id),
    maxResults: MAX_RESULTS,
    timeoutMs: TIMEOUT_MS,
  })
}

/** 現行の実装（src/main の solveBuilds）の出力。ケースごとに 1 回だけ求める（時間の上限は長くとる） */
async function reference(c: Case): Promise<Reference> {
  const cached = references.get(c.label)
  if (cached !== undefined) return cached
  const request = { ...requestOf(c), timeoutMs: 600_000 }
  const res = await solveBuilds(highs, master, request, {
    now: () => performance.now(),
    yieldControl: () => Promise.resolve(),
  })
  const value = {
    scores: res.builds.map((b) => b.score ?? Number.NaN),
    keys: res.builds.map((b) => JSON.stringify([b.armor, b.charmId])),
  }
  references.set(c.label, value)
  return value
}

const fmt = (ms: number) => ms.toFixed(0)

function report() {
  const header =
    '| 方式 | ケース | 状態 | 合計 ms 最大 | 1件目 ms 最大 | 求解の回数 | 件数 | 1件目の期待値が現行と一致 | 10件の列が現行と一致 |\n|---|---|---|---|---|---|---|---|---|'
  const lines = rows.map(
    (r) =>
      `| ${r.config} | ${r.case} | ${r.status} | ${fmt(r.totalMax)} | ${fmt(r.firstMax)} | ${r.solves} | ${r.builds} | ${r.firstEqual ? 'はい' : 'いいえ'} | ${r.listEqual ? 'はい' : 'いいえ'} |`,
  )
  const byConfig = new Map<string, Row[]>()
  for (const r of rows) byConfig.set(r.config, [...(byConfig.get(r.config) ?? []), r])
  const summary = [...byConfig].map(([name, rs]) => {
    const total = Math.max(...rs.map((r) => r.totalMax))
    const first = Math.max(...rs.map((r) => r.firstMax))
    const ok = rs.every((r) => r.firstEqual && r.status !== 'timeout')
    return `| ${name} | ${rs.length} | ${fmt(total)} | ${fmt(first)} | ${ok ? 'はい' : 'いいえ'} |`
  })
  console.log(
    [
      header,
      ...lines,
      '',
      '| 方式 | ケース数 | 全ケースの合計 ms 最大 | 全ケースの1件目 ms 最大 | 全て1件目一致かつ打ち切りなし |\n|---|---|---|---|---|',
      ...summary,
    ].join('\n'),
  )
}

describe('期待値の方式の試作', () => {
  beforeAll(async () => {
    highs = await highsLoader()
    master = loadRealMaster()
  })
  afterAll(() => {
    if (rows.length > 0) report()
  })

  describe.each(SELECTED_CONFIGS)('$name', (cfg) => {
    it.each(SELECTED_CASES)('$label', async (c) => {
      const ref = await reference(c)
      const request = requestOf(c)
      const runs: ProtoResult[] = []
      for (let i = 0; i < REPEATS; i++) {
        const r = protoSolve(highs, master, request, cfg)
        runs.push(r)
        if (r.status === 'timeout') break
      }
      const last = runs.at(-1)
      if (last === undefined) throw new Error('no runs')
      const near = (x: number | undefined, y: number | undefined) =>
        x !== undefined && y !== undefined && Math.abs(x - y) <= DAMAGE_EPSILON
      const firstEqual =
        ref.scores.length === 0 ? last.scores.length === 0 : near(last.scores[0], ref.scores[0])
      const listEqual =
        last.scores.length === ref.scores.length &&
        ref.scores.every((s, i) => near(s, last.scores[i]))
      rows.push({
        config: cfg.name,
        case: c.label,
        status: last.status === 'timeout' ? 'timeout(打ち切り)' : last.status,
        totalMax: Math.max(...runs.map((r) => r.totalMs)),
        firstMax: Math.max(...runs.map((r) => r.firstMs ?? r.totalMs)),
        solves: last.solves,
        builds: last.scores.length,
        firstEqual,
        listEqual,
      })
      if (last.status !== 'timeout') expect(last.status).toBe(c.expected)
    })
  })
})

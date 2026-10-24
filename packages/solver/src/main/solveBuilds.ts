import type { Highs, Model } from 'highs'
import type { MasterBundle } from '@swv/data'
import { SolveCancelledError } from './errors'
import { buildModel, readSelection, type IlpModel, type Selection } from './model'
import { evaluateDamage } from './damage'
import type { DamageColumns } from './damageModel'
import { assembleBuild } from './placement'
import type {
  SolveOptions,
  SolvedBuild,
  SolverRequest,
  SolverResponse,
  SolverStatus,
} from './request'
import { validateRequest, type ResolvedWeapon } from './validate'

function passModel(highs: Highs, model: Model, ilp: IlpModel) {
  const { variableType, objectiveSense } = highs.constants
  const { numCols, rows } = ilp
  const starts: number[] = [0]
  for (const r of rows) starts.push((starts.at(-1) ?? 0) + r.indices.length)
  model.passModel({
    numCols,
    numRows: rows.length,
    sense: objectiveSense.maximize,
    colCost: ilp.colCost,
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
      integer ? variableType.integer : variableType.continuous,
    ),
  })
}

/** 列挙の入力と、求解の外部依存をまとめたもの */
interface EnumerateContext {
  highs: Highs
  master: MasterBundle
  request: SolverRequest
  weapon: ResolvedWeapon
  options: SolveOptions
  start: number
}

/** 列挙の結果。timedOut は時間の上限で打ち切ったこと */
interface Enumerated {
  builds: SolvedBuild[]
  timedOut: boolean
}

/** 構成を 1 件読み出す。進捗は呼び出し側が送る */
function toBuild(ctx: EnumerateContext, selection: Selection): SolvedBuild {
  const { master, weapon, request } = ctx
  const build = assembleBuild(master, weapon, selection, request.objective)
  if (request.objective.kind === 'maximize' && request.objective.metric === 'expectedDamage') {
    // score は ILP の目的値ではなく、返す構成から計算し直した期待値（D15）
    build.score = evaluateDamage(
      master,
      weapon,
      build.skills,
      request.activeConditionIds,
    ).expectedDamage
  }
  return build
}

/** 期待値の同点の許容差（D14。テストの降順・総当たりとの一致の比較も同じ値を使う） */
export const DAMAGE_EPSILON = 1e-6

/** 求解の前の判定。キャンセルは例外、時間切れなら false。解く前に時計と time_limit を整える */
async function readyToSolve(ctx: EnumerateContext, model: Model): Promise<boolean> {
  const { request, options, start } = ctx
  await options.yieldControl()
  if (options.isCancelled?.() === true) throw new SolveCancelledError()
  const remainingMs = request.timeoutMs - (options.now() - start)
  if (remainingMs <= 0) return false
  // time_limit は累積の時計で判定されるため、毎回リセットして残り時間を設定する
  model.zeroAllClocks()
  model.options.set('time_limit', remainingMs / 1000)
  return true
}

/** 求解 1 回の結果。optimal・時間切れ・解なし以外は例外 */
function runModel(highs: Highs, model: Model): 'optimal' | 'timeout' | 'infeasible' {
  const { modelStatus: status } = highs.constants
  const { modelStatus } = model.run()
  if (modelStatus === status.timeLimit) return 'timeout'
  if (modelStatus === status.infeasible || modelStatus === status.unboundedOrInfeasible) {
    return 'infeasible'
  }
  if (modelStatus !== status.optimal) {
    throw new Error(`HiGHS が最適解も解なしも返さなかった（modelStatus=${modelStatus}）`)
  }
  return 'optimal'
}

/**
 * expectedDamage: 1 件ごとに 2 段で解く（D14）。
 * 1 段目は θ だけを目的にして期待値 E1 を求め、2 段目は θ ≥ E1 − ε の下で空き Lv の重みを目的にする。
 */
async function enumerateDamage(
  ctx: EnumerateContext,
  ilp: IlpModel,
  damage: DamageColumns,
  model: Model,
): Promise<Enumerated> {
  const { highs, request, options } = ctx
  const builds: SolvedBuild[] = []
  const all = { kind: 'range', from: 0, to: ilp.numCols - 1 } as const
  let rowCount = ilp.rows.length
  model.options.set('mip_abs_gap', 0)

  while (builds.length < request.maxResults) {
    if (!(await readyToSolve(ctx, model))) return { builds, timedOut: true }
    model.changeColsCost(all, damage.stage1Cost)
    const first = runModel(highs, model)
    if (first === 'timeout') return { builds, timedOut: true }
    if (first === 'infeasible') break
    const e1 = toBuild(ctx, readSelection(ilp, model.getSolution().colValue)).score ?? 0

    // 2 段目: θ ≥ E1 − ε を足して、空き Lv の重みで解く（打ち切ったらこの件は返さない）
    model.addRow(e1 - DAMAGE_EPSILON, highs.infinity, {
      indices: [damage.thetaCol],
      values: [1],
    })
    rowCount++
    model.changeColsCost(all, ilp.colCost)
    if (!(await readyToSolve(ctx, model))) return { builds, timedOut: true }
    const second = runModel(highs, model)
    if (second === 'timeout') return { builds, timedOut: true }
    if (second === 'infeasible') {
      throw new Error('期待値の下限の行を足した 2 段目が解なしになった（1 段目の解は満たすはず）')
    }
    const selection = readSelection(ilp, model.getSolution().colValue)
    builds.push(toBuild(ctx, selection))
    options.onProgress?.(builds.length)

    // 足した行を外し、防具と護石の組を除く行を足す
    model.deleteRows({ kind: 'range', from: rowCount - 1, to: rowCount - 1 })
    rowCount--
    const { chosen } = selection
    if (chosen.length === 0) break
    model.addRow(-highs.infinity, chosen.length - 1, {
      indices: chosen,
      values: chosen.map(() => 1),
    })
    rowCount++
  }
  return { builds, timedOut: false }
}

async function enumerate(ctx: EnumerateContext, ilp: IlpModel): Promise<Enumerated> {
  const { highs, request, options } = ctx
  const builds: SolvedBuild[] = []

  if (ilp.numCols === 0) {
    // 変数が無い（全部位が null 固定で護石の候補も空）。他の組は無いので 1 件で終える
    const empty = readSelection(ilp, [])
    options.onProgress?.(1)
    return { builds: [toBuild(ctx, empty)], timedOut: false }
  }

  return highs.withModel(async (model): Promise<Enumerated> => {
    model.options.set('output_flag', false)
    // 目的は整数値。重みを掛けた目的の下位の項が許容差に埋もれないようにする
    model.options.set('mip_rel_gap', 0)
    passModel(highs, model, ilp)
    if (ilp.damage !== undefined) return enumerateDamage(ctx, ilp, ilp.damage, model)

    while (builds.length < request.maxResults) {
      if (!(await readyToSolve(ctx, model))) return { builds, timedOut: true }
      const result = runModel(highs, model)
      if (result === 'timeout') return { builds, timedOut: true }
      if (result === 'infeasible') break
      const selection = readSelection(ilp, model.getSolution().colValue)
      builds.push(toBuild(ctx, selection))
      options.onProgress?.(builds.length)
      const { chosen } = selection
      if (chosen.length === 0) break
      // 防具と護石の組を除く: 選んだ変数の和 <= 個数 - 1
      model.addRow(-highs.infinity, chosen.length - 1, {
        indices: chosen,
        values: chosen.map(() => 1),
      })
    }
    return { builds, timedOut: false }
  })
}

function finishStatus(request: SolverRequest, found: number, timedOut: boolean): SolverStatus {
  if (timedOut) return 'timeout'
  if (found === 0) return 'infeasible'
  return request.objective.kind === 'feasible' ? 'feasible' : 'optimal'
}

/**
 * 必須スキルを満たす構成を、防具と護石の組が重ならないように最大 maxResults 件求める。
 * 不正な要求は InvalidRequestError、キャンセルは SolveCancelledError を投げる。
 */
export async function solveBuilds(
  highs: Highs,
  master: MasterBundle,
  request: SolverRequest,
  options: SolveOptions,
): Promise<SolverResponse> {
  const start = options.now()
  const weapon = validateRequest(master, request)
  const ilp = buildModel(master, request, weapon, highs.infinity)
  const ctx: EnumerateContext = { highs, master, request, weapon, options, start }
  const { builds, timedOut } =
    ilp === null ? { builds: [], timedOut: false } : await enumerate(ctx, ilp)
  return {
    status: finishStatus(request, builds.length, timedOut),
    builds,
    elapsedMs: options.now() - start,
  }
}

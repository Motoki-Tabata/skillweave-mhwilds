import type { Highs, Model } from 'highs'
import type { MasterBundle } from '@swv/data'
import { SolveCancelledError } from './errors'
import { buildModel, readSelection, type IlpModel, type Selection } from './model'
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
    colLower: Array.from({ length: numCols }, () => 0),
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
    integrality: Array.from({ length: numCols }, () => variableType.integer),
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
  return assembleBuild(ctx.master, ctx.weapon, selection, ctx.request.objective)
}

async function enumerate(ctx: EnumerateContext, ilp: IlpModel): Promise<Enumerated> {
  const { highs, request, options, start } = ctx
  const { modelStatus: status } = highs.constants
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

    while (builds.length < request.maxResults) {
      await options.yieldControl()
      if (options.isCancelled?.() === true) throw new SolveCancelledError()
      const remainingMs = request.timeoutMs - (options.now() - start)
      if (remainingMs <= 0) return { builds, timedOut: true }
      // time_limit は累積の時計で判定されるため、毎回リセットして残り時間を設定する
      model.zeroAllClocks()
      model.options.set('time_limit', remainingMs / 1000)

      const { modelStatus } = model.run()
      if (modelStatus === status.timeLimit) return { builds, timedOut: true }
      if (modelStatus === status.infeasible || modelStatus === status.unboundedOrInfeasible) break
      if (modelStatus !== status.optimal) {
        throw new Error(`HiGHS が最適解も解なしも返さなかった（modelStatus=${modelStatus}）`)
      }
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

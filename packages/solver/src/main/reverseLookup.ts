import type { Highs } from 'highs'
import type { MasterBundle, SkillLevel, Slot } from '@swv/data'
import { InvalidRequestError } from './errors'
import { readSelection, buildModel, type IlpModel } from './model'
import { assembleBuild } from './placement'
import type {
  SolveOptions,
  SolvedBuild,
  SolverCharm,
  SolverRequest,
  SolverWeapon,
  Uuid,
} from './request'
import type { LotteryCols } from './reverseModel'
import { passModel, readyToSolve, runModel, type ClockContext } from './solveBuilds'
import { validateRequest, type ResolvedWeapon } from './validate'

/** 逆引きの要求。登録した護石・目的関数・発動条件は持たない（検索画面の条件だけで護石を逆引きする） */
export interface ReverseLookupRequest {
  masterVersion: SolverRequest['masterVersion']
  weapon: SolverWeapon
  required: SkillLevel[]
  fixedArmor?: SolverRequest['fixedArmor']
  excludedArmorIds?: SolverRequest['excludedArmorIds']
  excludedDecorationIds?: SolverRequest['excludedDecorationIds']
  maxResults: number
  timeoutMs: number
}

/** 抽選テーブルに収まる仮想の護石 */
export interface VirtualCharm {
  rarity: number
  /** パターンの枠の順（グループが null の枠を除く）。null は構成に効かない「任意」の枠 */
  skills: (SkillLevel | null)[]
  slots: Slot[]
}

export interface ReverseLookupCandidate {
  charm: VirtualCharm
  /**
   * その護石を使った構成。`charmId` は null。
   * `decorations`・`freeSlots` の `owner: 'charm'` の `index` は `charm.slots` の添字を指す。
   */
  build: SolvedBuild
}

export interface ReverseLookupResponse {
  status: 'feasible' | 'infeasible' | 'timeout'
  candidates: ReverseLookupCandidate[]
  elapsedMs: number
}

/** `SolveOptions` の `onProgress` を候補を受け取る形に替えたもの */
export interface ReverseLookupOptions extends Omit<SolveOptions, 'onProgress'> {
  onProgress?: (found: number, candidate: ReverseLookupCandidate) => void
}

/** 仮想の護石を構成へ組むときの内部の護石 ID（結果には出さない） */
const VIRTUAL_CHARM_ID = 'reverse-lookup' as Uuid

/** 内部で使う通常の要求（登録した護石なし・feasible）。validateRequest と buildModel に渡す */
function toSolverRequest(request: ReverseLookupRequest): SolverRequest {
  return { ...request, charms: [], objective: { kind: 'feasible' } }
}

function sameSlots(a: readonly Slot[], b: readonly Slot[]): boolean {
  return (
    a.length === b.length && a.every((s, i) => s.target === b[i]?.target && s.level === b[i]?.level)
  )
}

/** 1 になった v・u の列から仮想の護石を読み出す */
function readCharm(
  master: MasterBundle,
  lot: LotteryCols,
  colValue: ArrayLike<number>,
): VirtualCharm {
  const isOne = (col: number) => (colValue[col] ?? 0) > 0.5
  const chosen = lot.v.find((c) => isOne(c.col))
  if (chosen === undefined)
    throw new Error('パターンとスロットの並びが選ばれていない（モデルの不整合）')
  const pattern = master.appraisedCharm.patterns[chosen.pattern]
  const size = pattern?.skillGroups.filter((g) => g !== null).length ?? 0
  const skills: (SkillLevel | null)[] = Array.from({ length: size }, () => null)
  for (const c of lot.u) {
    if (c.pattern === chosen.pattern && isOne(c.col)) {
      skills[c.slot] = { skillId: c.skillId, level: c.level }
    }
  }
  return { rarity: chosen.rarity, skills, slots: chosen.slots.map((s) => ({ ...s })) }
}

function requiredOf(charm: VirtualCharm): SkillLevel[] {
  return charm.skills.flatMap((s) => (s === null ? [] : [s]))
}

/** 先に見つけた候補より厳しいだけの護石を除く行（D5）。上界は要るスキルの数 */
function exclusionRow(lot: LotteryCols, charm: VirtualCharm) {
  const required = requiredOf(charm)
  const indices: number[] = []
  for (const { skillId, level } of required) {
    for (const c of lot.u) if (c.skillId === skillId && c.level >= level) indices.push(c.col)
  }
  for (const c of lot.v) if (sameSlots(c.slots, charm.slots)) indices.push(c.col)
  return { indices, values: indices.map(() => 1), upper: required.length }
}

function toCandidate(
  master: MasterBundle,
  weapon: ResolvedWeapon,
  ilp: IlpModel,
  lot: LotteryCols,
  colValue: ArrayLike<number>,
): ReverseLookupCandidate {
  const charm = readCharm(master, lot, colValue)
  const solverCharm: SolverCharm = {
    id: VIRTUAL_CHARM_ID,
    rarity: charm.rarity,
    skills: requiredOf(charm),
    slots: charm.slots,
  }
  const selection = { ...readSelection(ilp, colValue), charm: solverCharm }
  const build = assembleBuild(master, weapon, selection, { kind: 'feasible' })
  build.charmId = null
  return { charm, build }
}

/** 要るスキルの数 → レベルの合計 → レア度の順（AC-5）。同じ値の間は見つけた順のまま */
function sortCandidates(candidates: ReverseLookupCandidate[]): ReverseLookupCandidate[] {
  const key = ({ charm }: ReverseLookupCandidate) => {
    const required = requiredOf(charm)
    return [required.length, required.reduce((sum, s) => sum + s.level, 0), charm.rarity] as const
  }
  return candidates.toSorted((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
  })
}

interface Enumerated {
  candidates: ReverseLookupCandidate[]
  timedOut: boolean
}

async function enumerateCharms(
  highs: Highs,
  master: MasterBundle,
  weapon: ResolvedWeapon,
  ilp: IlpModel,
  lot: LotteryCols,
  ctx: ClockContext & { request: ReverseLookupRequest; options: ReverseLookupOptions },
): Promise<Enumerated> {
  return highs.withModel(async (model): Promise<Enumerated> => {
    model.options.set('output_flag', false)
    // 目的は整数値。重みを掛けた目的の下位の項が許容差に埋もれないようにする
    model.options.set('mip_rel_gap', 0)
    passModel(highs, model, ilp)
    const candidates: ReverseLookupCandidate[] = []
    while (candidates.length < ctx.request.maxResults) {
      if (!(await readyToSolve(ctx, model))) return { candidates, timedOut: true }
      const result = runModel(highs, model)
      if (result === 'timeout') return { candidates, timedOut: true }
      if (result === 'infeasible') break
      const candidate = toCandidate(master, weapon, ilp, lot, model.getSolution().colValue)
      candidates.push(candidate)
      ctx.options.onProgress?.(candidates.length, candidate)
      const row = exclusionRow(lot, candidate.charm)
      model.addRow(-highs.infinity, row.upper, { indices: row.indices, values: row.values })
    }
    return { candidates, timedOut: false }
  })
}

function statusOf(found: number, timedOut: boolean): ReverseLookupResponse['status'] {
  if (timedOut) return 'timeout'
  return found === 0 ? 'infeasible' : 'feasible'
}

/**
 * 検索画面の条件を満たす構成を組める護石を、抽選テーブルから逆引きする。
 * 護石の選択を ILP の変数に持ち、1 回の求解で護石と構成を同時に決める。
 * 不正な要求・抽選テーブルが空のときは InvalidRequestError、キャンセルは SolveCancelledError を投げる。
 */
export async function reverseLookup(
  highs: Highs,
  master: MasterBundle,
  request: ReverseLookupRequest,
  options: ReverseLookupOptions,
): Promise<ReverseLookupResponse> {
  const start = options.now()
  const solverRequest = toSolverRequest(request)
  const weapon = validateRequest(master, solverRequest)
  if (master.appraisedCharm.patterns.length === 0) {
    throw new InvalidRequestError('抽選テーブルが無い')
  }
  const ilp = buildModel(master, solverRequest, weapon, highs.infinity, master.appraisedCharm)
  const lot = ilp?.lottery
  const { candidates, timedOut } =
    ilp === null || lot === undefined
      ? { candidates: [], timedOut: false }
      : await enumerateCharms(highs, master, weapon, ilp, lot, {
          request,
          options,
          start,
        })
  return {
    status: statusOf(candidates.length, timedOut),
    candidates: sortCandidates(candidates),
    elapsedMs: options.now() - start,
  }
}

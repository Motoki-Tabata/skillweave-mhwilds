import type {
  ArmorPart,
  MasterArmor,
  MasterBundle,
  MasterDecoration,
  SkillId,
  SlotLevel,
  SlotTarget,
} from '@swv/data'
import type { SolverCharm, SolverRequest } from './request'
import { findSetBonus, isSetSkill, piecesForLevel, skillLevelOf } from './skills'
import { PARTS, type ResolvedWeapon } from './validate'

const LEVELS: readonly SlotLevel[] = [1, 2, 3, 4]
const TARGETS: readonly SlotTarget[] = ['weapon', 'armor']

export interface Row {
  lower: number
  upper: number
  indices: number[]
  values: number[]
}

/** 列の並び: 防具 x、護石 y（ここまで 0/1）、装飾品 n、配置 z（ここから非負整数） */
export interface IlpModel {
  numCols: number
  numBinary: number
  colCost: number[]
  colUpper: number[]
  rows: Row[]
  armorCols: { part: ArmorPart; armor: MasterArmor; col: number }[]
  charmCols: { charm: SolverCharm; col: number }[]
  decoCols: { deco: MasterDecoration; col: number }[]
}

export interface Selection {
  armor: Record<ArmorPart, MasterArmor | null>
  charm: SolverCharm | null
  /** マスターの decorations の並びのまま、個数が 1 以上のもの */
  decorations: { deco: MasterDecoration; count: number }[]
  /** 防具と護石の変数のうち 1 になった列（次の求解で除く行に使う） */
  chosen: number[]
}

type Slots = readonly { target: SlotTarget; level: number }[]
type PartCandidates = { part: ArmorPart; armors: MasterArmor[] }[]
type Coefs = [number, number][]

/** 配置の列 z: 種別 target・Lv d の装飾品を Lv s のスロットへ付ける個数（d <= s） */
interface PlacementCol {
  target: SlotTarget
  d: number
  s: number
  col: number
}

/** 列の割り当て（防具 x → 護石 y → 装飾品 n → 配置 z） */
interface Columns {
  numCols: number
  numBinary: number
  armorCols: IlpModel['armorCols']
  charmCols: IlpModel['charmCols']
  decoCols: IlpModel['decoCols']
  zCols: PlacementCol[]
}

function levelSum(slots: Slots, target: SlotTarget): number {
  let sum = 0
  for (const s of slots) if (s.target === target) sum += s.level
  return sum
}

function exactCount(slots: Slots, target: SlotTarget, level: number): number {
  return slots.filter((s) => s.target === target && s.level === level).length
}

/** 係数が 0 でない列だけを集めた行を作る */
function sparseRow(lower: number, upper: number, coefs: Coefs): Row {
  const nonZero = coefs.filter(([, v]) => v !== 0)
  return {
    lower,
    upper,
    indices: nonZero.map(([c]) => c),
    values: nonZero.map(([, v]) => v),
  }
}

function isCandidate(
  armor: MasterArmor,
  part: ArmorPart,
  fixedId: string | undefined,
  excluded: ReadonlySet<string>,
): boolean {
  if (armor.part !== part) return false
  return fixedId === undefined ? !excluded.has(armor.id) : armor.id === fixedId
}

/** 固定されていない部位は除外を引いた全防具、固定された部位はその 1 つ、null 固定の部位は列を作らない */
function candidateArmors(master: MasterBundle, request: SolverRequest): PartCandidates {
  const fixed = request.fixedArmor ?? {}
  const excluded = new Set<string>(request.excludedArmorIds ?? [])
  const result: PartCandidates = []
  for (const part of PARTS) {
    const id = fixed[part]
    if (id === null) continue
    result.push({
      part,
      armors: master.armors.filter((a) => isCandidate(a, part, id, excluded)),
    })
  }
  return result
}

/** 必須スキルを 1 つでも持つ装飾品だけを変数にする（持たない装飾品は選ばれても空きを減らすだけ） */
function candidateDecorations(master: MasterBundle, request: SolverRequest): MasterDecoration[] {
  const ordinary = new Set(
    request.required
      .filter((r) => !isSetSkill(master.skills.find((s) => s.id === r.skillId)))
      .map((r) => r.skillId),
  )
  return master.decorations.filter((d) => d.skills.some((s) => ordinary.has(s.skillId)))
}

function assignColumns(
  parts: PartCandidates,
  charms: readonly SolverCharm[],
  decos: readonly MasterDecoration[],
): Columns {
  let numCols = 0
  const armorCols = parts.flatMap((p) =>
    p.armors.map((armor) => ({ part: p.part, armor, col: numCols++ })),
  )
  const charmCols = charms.map((charm) => ({ charm, col: numCols++ }))
  const numBinary = numCols
  const decoCols = decos.map((deco) => ({ deco, col: numCols++ }))
  // 装飾品の変数がある (種別, Lv) だけ配置の列を作る
  const zCols: PlacementCol[] = []
  for (const target of TARGETS) {
    for (const d of LEVELS) {
      if (!decoCols.some((c) => c.deco.target === target && c.deco.slotLevel === d)) continue
      for (const s of LEVELS.filter((level) => level >= d)) {
        zCols.push({ target, d, s, col: numCols++ })
      }
    }
  }
  return { numCols, numBinary, armorCols, charmCols, decoCols, zCols }
}

/** 空き Lv の合計の上界（目的の重みを決めるため）。部位ごとの候補の最大、護石の候補の最大、武器の合計 */
function slotUpperBound(
  target: SlotTarget,
  weapon: ResolvedWeapon,
  parts: PartCandidates,
  charms: readonly SolverCharm[],
): number {
  const maxOf = (values: number[]) => Math.max(0, ...values)
  return (
    levelSum(weapon.slots, target) +
    parts.reduce((sum, p) => sum + maxOf(p.armors.map((a) => levelSum(a.slots, target))), 0) +
    maxOf(charms.map((c) => levelSum(c.slots, target)))
  )
}

/**
 * 目的 c1·P + c2·A + W（辞書式）の係数を列ごとに作る。
 * P は主目的、A は防具用の空き Lv の合計、W は武器用の空き Lv の合計。
 * 空き Lv の合計 = スロット Lv の合計 − 付けた装飾品のスロット Lv の合計。
 */
function objectiveCosts(
  request: SolverRequest,
  weapon: ResolvedWeapon,
  parts: PartCandidates,
  cols: Columns,
): number[] {
  const bound = (t: SlotTarget) => slotUpperBound(t, weapon, parts, request.charms)
  const c2 = bound('weapon') + 1
  const c1 = c2 * (bound('armor') + 1)
  const { objective } = request
  const isMaximize = objective.kind === 'maximize'
  const isDefense = isMaximize && objective.metric === 'defense'
  const isFreeSlots = isMaximize && objective.metric === 'freeSlots'
  const weightA = c2 + (isFreeSlots ? c1 : 0)
  const weightOf = (t: SlotTarget) => (t === 'armor' ? weightA : 1)
  const slotValue = (slots: Slots) =>
    TARGETS.reduce((sum, t) => sum + weightOf(t) * levelSum(slots, t), 0)

  const cost = Array.from({ length: cols.numCols }, () => 0)
  for (const { armor, col } of cols.armorCols) {
    cost[col] = (isDefense ? c1 * armor.defense : 0) + slotValue(armor.slots)
  }
  for (const { charm, col } of cols.charmCols) cost[col] = slotValue(charm.slots)
  for (const { target, s, col } of cols.zCols) cost[col] = -s * weightOf(target)
  return cost
}

/** 部位ごとに 1 つ、護石は候補があれば 1 つ */
function selectionRows(parts: PartCandidates, cols: Columns): Row[] {
  const rows = parts.map((p) =>
    sparseRow(
      1,
      1,
      cols.armorCols.filter((c) => c.part === p.part).map((c): [number, number] => [c.col, 1]),
    ),
  )
  if (cols.charmCols.length > 0) {
    rows.push(
      sparseRow(
        1,
        1,
        cols.charmCols.map((c): [number, number] => [c.col, 1]),
      ),
    )
  }
  return rows
}

/** シリーズ／グループスキル: 部位数 >= 下限のレベルに届く最小の部位数（武器が持てば 1 引く）。護石と装飾品は数えない */
function setSkillRow(
  master: MasterBundle,
  weapon: ResolvedWeapon,
  cols: Columns,
  skillId: SkillId,
  level: number,
  infinity: number,
): Row | null {
  const bonus = findSetBonus(master, skillId)
  const pieces = bonus === undefined ? undefined : piecesForLevel(bonus, level)
  if (bonus === undefined || pieces === undefined) return null
  const weaponHas = weapon.setBonusIds.includes(bonus.id) ? 1 : 0
  return sparseRow(
    pieces - weaponHas,
    infinity,
    cols.armorCols.map((c): [number, number] => [
      c.col,
      c.armor.setBonusIds.includes(bonus.id) ? 1 : 0,
    ]),
  )
}

/** 通常のスキル: 武器 + 防具 + 護石 + 装飾品のレベルの和 >= 下限 */
function ordinarySkillRow(
  weapon: ResolvedWeapon,
  cols: Columns,
  skillId: SkillId,
  level: number,
  infinity: number,
): Row {
  return sparseRow(level - skillLevelOf(weapon.skills, skillId), infinity, [
    ...cols.armorCols.map((c): [number, number] => [c.col, skillLevelOf(c.armor.skills, skillId)]),
    ...cols.charmCols.map((c): [number, number] => [c.col, skillLevelOf(c.charm.skills, skillId)]),
    ...cols.decoCols.map((c): [number, number] => [c.col, skillLevelOf(c.deco.skills, skillId)]),
  ])
}

/** 必須スキルごとの行。到達できない下限があれば null */
function skillRows(
  master: MasterBundle,
  request: SolverRequest,
  weapon: ResolvedWeapon,
  cols: Columns,
  infinity: number,
): Row[] | null {
  const rows: Row[] = []
  for (const req of request.required) {
    const skill = master.skills.find((s) => s.id === req.skillId)
    const row = isSetSkill(skill)
      ? setSkillRow(master, weapon, cols, req.skillId, req.level, infinity)
      : ordinarySkillRow(weapon, cols, req.skillId, req.level, infinity)
    if (row === null) return null
    if (row.indices.length > 0) rows.push(row)
    else if (row.lower > 0) return null
  }
  return rows
}

/** 配置: 種別 t・Lv d ごとに Σ_s z = Σ n、種別 t・Lv s ごとに Σ_d z <= そのスロットの数 */
function placementRows(weapon: ResolvedWeapon, cols: Columns, infinity: number): Row[] {
  const rows: Row[] = []
  for (const t of TARGETS) {
    for (const d of LEVELS) {
      const zs = cols.zCols.filter((z) => z.target === t && z.d === d)
      if (zs.length === 0) continue
      const ns = cols.decoCols.filter((c) => c.deco.target === t && c.deco.slotLevel === d)
      rows.push(
        sparseRow(0, 0, [
          ...zs.map((z): [number, number] => [z.col, 1]),
          ...ns.map((c): [number, number] => [c.col, -1]),
        ]),
      )
    }
    for (const s of LEVELS) {
      const zs = cols.zCols.filter((z) => z.target === t && z.s === s)
      if (zs.length === 0) continue
      rows.push(
        sparseRow(-infinity, exactCount(weapon.slots, t, s), [
          ...zs.map((z): [number, number] => [z.col, 1]),
          ...cols.armorCols.map((c): [number, number] => [c.col, -exactCount(c.armor.slots, t, s)]),
          ...cols.charmCols.map((c): [number, number] => [c.col, -exactCount(c.charm.slots, t, s)]),
        ]),
      )
    }
  }
  return rows
}

/**
 * ILP を組み立てる。構成を作る前に解なしと分かるとき（固定されていない部位の候補が空、
 * 到達できない下限）は null を返す。
 */
export function buildModel(
  master: MasterBundle,
  request: SolverRequest,
  weapon: ResolvedWeapon,
  infinity: number,
): IlpModel | null {
  const parts = candidateArmors(master, request)
  if (parts.some((p) => p.armors.length === 0)) return null
  const cols = assignColumns(parts, request.charms, candidateDecorations(master, request))
  const skills = skillRows(master, request, weapon, cols, infinity)
  if (skills === null) return null
  return {
    numCols: cols.numCols,
    numBinary: cols.numBinary,
    colCost: objectiveCosts(request, weapon, parts, cols),
    colUpper: Array.from({ length: cols.numCols }, (_, i) => (i < cols.numBinary ? 1 : infinity)),
    rows: [...selectionRows(parts, cols), ...skills, ...placementRows(weapon, cols, infinity)],
    armorCols: cols.armorCols,
    charmCols: cols.charmCols,
    decoCols: cols.decoCols,
  }
}

/** 解の値（colValue）から防具・護石・装飾品の個数を読み出す */
export function readSelection(model: IlpModel, colValue: ArrayLike<number>): Selection {
  const isOne = (col: number) => (colValue[col] ?? 0) > 0.5
  const armor: Record<ArmorPart, MasterArmor | null> = {
    head: null,
    chest: null,
    arms: null,
    waist: null,
    legs: null,
  }
  const chosen: number[] = []
  for (const c of model.armorCols) {
    if (!isOne(c.col)) continue
    armor[c.part] = c.armor
    chosen.push(c.col)
  }
  let charm: SolverCharm | null = null
  for (const c of model.charmCols) {
    if (!isOne(c.col)) continue
    charm = c.charm
    chosen.push(c.col)
  }
  const decorations = model.decoCols.flatMap((c) => {
    const count = Math.round(colValue[c.col] ?? 0)
    return count > 0 ? [{ deco: c.deco, count }] : []
  })
  return { armor, charm, decorations, chosen }
}

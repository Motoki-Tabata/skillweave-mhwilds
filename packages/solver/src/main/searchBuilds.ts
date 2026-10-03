import type { Highs, Model } from 'highs'
import type {
  ArmorPart,
  FoundBuild,
  SearchInput,
  SearchResult,
  Slot,
  SlotLevel,
  SlotTarget,
  SolverArmor,
  SolverDecoration,
} from './types'

const PARTS: readonly ArmorPart[] = ['head', 'chest', 'arms', 'waist', 'legs']
const LEVELS: readonly SlotLevel[] = [1, 2, 3, 4]
const TARGETS: readonly SlotTarget[] = ['weapon', 'armor']
const DEFAULT_MAX_RESULTS = 30
// HiGHS の ModelStatus（highs.constants.modelStatus と同じ値）
const MODEL_STATUS_OPTIMAL = 7
const MODEL_STATUS_INFEASIBLE = 8
const MODEL_STATUS_UNBOUNDED_OR_INFEASIBLE = 9

interface Row {
  lower: number
  upper: number
  indices: number[]
  values: number[]
}

/** 列の並び: 防具 x、護石 y、装飾品 n の順 */
interface Layout {
  armorCol: (i: number) => number
  charmCol: (i: number) => number
  decoCol: (i: number) => number
  numCols: number
  numBinary: number
}

const INFEASIBLE: SearchResult = { status: 'infeasible', builds: [] }

/** スロットの数（種別 target で Lv >= level のもの） */
function countSlots(slots: readonly Slot[], target: SlotTarget, level: SlotLevel): number {
  return slots.filter((s) => s.target === target && s.level >= level).length
}

function skillLevelOf(skills: readonly { skillId: string; level: number }[], skillId: string) {
  let sum = 0
  for (const s of skills) if (s.skillId === skillId) sum += s.level
  return sum
}

/** 係数が 0 でない列だけを集めた行を作る */
function sparseRow(lower: number, upper: number, coefs: [number, number][]): Row {
  const nonZero = coefs.filter(([, v]) => v !== 0)
  return {
    lower,
    upper,
    indices: nonZero.map(([c]) => c),
    values: nonZero.map(([, v]) => v),
  }
}

function selectionRows(input: SearchInput, layout: Layout): Row[] {
  const rows = PARTS.map((p) =>
    sparseRow(
      1,
      1,
      input.armors.flatMap((a, i): [number, number][] =>
        a.part === p ? [[layout.armorCol(i), 1]] : [],
      ),
    ),
  )
  if (input.charms.length > 0) {
    rows.push(
      sparseRow(
        1,
        1,
        input.charms.map((_, i) => [layout.charmCol(i), 1]),
      ),
    )
  }
  return rows
}

/** 必須スキルごとの行。到達できない下限があれば null */
function skillRows(
  input: SearchInput,
  decorations: SolverDecoration[],
  layout: Layout,
  infinity: number,
): Row[] | null {
  const rows: Row[] = []
  for (const req of input.required) {
    const coefs: [number, number][] = [
      ...input.armors.map((a, i): [number, number] => [
        layout.armorCol(i),
        skillLevelOf(a.skills, req.skillId),
      ]),
      ...input.charms.map((c, i): [number, number] => [
        layout.charmCol(i),
        skillLevelOf(c.skills, req.skillId),
      ]),
      ...decorations.map((d, i): [number, number] => [
        layout.decoCol(i),
        skillLevelOf(d.skills, req.skillId),
      ]),
    ]
    const row = sparseRow(
      req.level - skillLevelOf(input.weapon.skills, req.skillId),
      infinity,
      coefs,
    )
    if (row.indices.length > 0) rows.push(row)
    else if (row.lower > 0) return null
  }
  return rows
}

/**
 * スロットの行: 種別 t・Lv L ごとに、種別 t で slotLevel >= L の装飾品の個数の和
 * <= 種別 t で Lv >= L のスロットの数（武器は定数、防具・護石は x・y の係数）
 */
function slotRows(
  input: SearchInput,
  decorations: SolverDecoration[],
  layout: Layout,
  infinity: number,
): Row[] {
  const rows: Row[] = []
  for (const target of TARGETS) {
    for (const level of LEVELS) {
      const decoCoefs = decorations.flatMap((d, i): [number, number][] =>
        d.target === target && d.slotLevel >= level ? [[layout.decoCol(i), 1]] : [],
      )
      if (decoCoefs.length === 0) continue
      const capacity: [number, number][] = [
        ...input.armors.map((a, i): [number, number] => [
          layout.armorCol(i),
          -countSlots(a.slots, target, level),
        ]),
        ...input.charms.map((c, i): [number, number] => [
          layout.charmCol(i),
          -countSlots(c.slots, target, level),
        ]),
      ]
      rows.push(
        sparseRow(-infinity, countSlots(input.weapon.slots, target, level), [
          ...decoCoefs,
          ...capacity,
        ]),
      )
    }
  }
  return rows
}

function passModel(highs: Highs, model: Model, rows: Row[], layout: Layout, armors: SolverArmor[]) {
  const { numCols, numBinary } = layout
  const { variableType, objectiveSense } = highs.constants
  const starts: number[] = [0]
  for (const r of rows) starts.push((starts.at(-1) ?? 0) + r.indices.length)
  model.passModel({
    numCols,
    numRows: rows.length,
    sense: objectiveSense.maximize,
    colCost: Array.from({ length: numCols }, (_, i) => armors[i]?.defense ?? 0),
    colLower: Array.from({ length: numCols }, () => 0),
    colUpper: Array.from({ length: numCols }, (_, i) => (i < numBinary ? 1 : highs.infinity)),
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

/** 解の値（colValue）から構成と、除外の行に使う変数の添字を読み出す */
function readBuild(
  colValue: Float64Array,
  input: SearchInput,
  decorations: SolverDecoration[],
  layout: Layout,
): { build: FoundBuild; chosen: number[] } {
  const isOne = (col: number) => (colValue[col] ?? 0) > 0.5
  const chosen: number[] = []
  const armor: Partial<Record<ArmorPart, SolverArmor>> = {}
  input.armors.forEach((a, i) => {
    if (isOne(layout.armorCol(i))) {
      chosen.push(layout.armorCol(i))
      armor[a.part] = a
    }
  })
  let charmId: FoundBuild['charmId'] = null
  input.charms.forEach((c, i) => {
    if (isOne(layout.charmCol(i))) {
      chosen.push(layout.charmCol(i))
      charmId = c.id
    }
  })
  const picked = PARTS.map((p) => {
    const a = armor[p]
    if (a === undefined) throw new Error(`解から部位 ${p} の防具を読み出せなかった`)
    return a
  })
  return {
    chosen,
    build: {
      armor: Object.fromEntries(PARTS.map((p, i) => [p, picked[i]?.id])) as FoundBuild['armor'],
      charmId,
      decorations: decorations.flatMap((d, i) => {
        const count = Math.round(colValue[layout.decoCol(i)] ?? 0)
        return count > 0 ? [{ decorationId: d.id, count }] : []
      }),
      defense: picked.reduce((sum, a) => sum + a.defense, 0),
    },
  }
}

export function searchBuilds(highs: Highs, input: SearchInput): SearchResult {
  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS
  const { armors, charms } = input
  const infinity = highs.infinity

  const hasAllParts = PARTS.every((p) => armors.some((a) => a.part === p))
  if (maxResults <= 0 || !hasAllParts) return INFEASIBLE

  // 必須スキルを1つも持たない装飾品は変数にしない
  const requiredIds = new Set<string>(input.required.map((r) => r.skillId))
  const decorations = input.decorations.filter((d) =>
    d.skills.some((s) => requiredIds.has(s.skillId)),
  )
  const layout: Layout = {
    armorCol: (i) => i,
    charmCol: (i) => armors.length + i,
    decoCol: (i) => armors.length + charms.length + i,
    numCols: armors.length + charms.length + decorations.length,
    numBinary: armors.length + charms.length,
  }

  const skills = skillRows(input, decorations, layout, infinity)
  if (skills === null) return INFEASIBLE
  const rows = [
    ...selectionRows(input, layout),
    ...skills,
    ...slotRows(input, decorations, layout, infinity),
  ]

  return highs.withModel((model) => {
    model.options.set('output_flag', false)
    passModel(highs, model, rows, layout, armors)

    const builds: FoundBuild[] = []
    while (builds.length < maxResults) {
      const { modelStatus } = model.run()
      if (
        modelStatus === MODEL_STATUS_INFEASIBLE ||
        modelStatus === MODEL_STATUS_UNBOUNDED_OR_INFEASIBLE
      ) {
        break
      }
      if (modelStatus !== MODEL_STATUS_OPTIMAL) {
        throw new Error(`HiGHS が最適解も解なしも返さなかった（modelStatus=${modelStatus}）`)
      }
      const { build, chosen } = readBuild(model.getSolution().colValue, input, decorations, layout)
      builds.push(build)
      // 防具と護石の組を除く: 選んだ変数の和 <= 個数 - 1
      model.addRow(-infinity, chosen.length - 1, {
        indices: chosen,
        values: chosen.map(() => 1),
      })
    }
    const result: SearchResult = builds.length === 0 ? INFEASIBLE : { status: 'optimal', builds }
    return result
  })
}

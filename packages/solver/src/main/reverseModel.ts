import type { MasterBundle, SkillId, Slot, SlotTarget } from '@swv/data'
import { sparseRow, type Row } from './rows'

/** 抽選テーブル（マスターの appraisedCharm） */
export type LotteryTable = MasterBundle['appraisedCharm']

/** パターンとスロットの並びの列 v[k,j]: パターン k の slotPatterns[j] を選ぶ */
export interface VCol {
  pattern: number
  rarity: number
  slots: Slot[]
  col: number
}

/** 枠のスキルの列 u[k,i,s]: パターン k の i 番目の枠（枠なしを除いた添字）に、必須スキル s をグループのレベルで入れる */
export interface UCol {
  pattern: number
  slot: number
  skillId: SkillId
  level: number
  col: number
}

/** 逆引きのときだけ持つ列（護石 y の列の後ろ。0/1） */
export interface LotteryCols {
  v: VCol[]
  u: UCol[]
  maxRarity: number
  maxLevel: number
}

/** 列を作る。alloc は次の列番号を返す（モデルの列の割り当てと同じ番号の空間を使う） */
export function lotteryColumns(
  table: LotteryTable,
  ordinary: ReadonlySet<SkillId>,
  alloc: () => number,
): LotteryCols {
  const v: VCol[] = []
  const u: UCol[] = []
  table.patterns.forEach((pattern, k) => {
    for (const slots of pattern.slotPatterns) {
      v.push({ pattern: k, rarity: pattern.rarity, slots, col: alloc() })
    }
    let slot = 0
    for (const name of pattern.skillGroups) {
      if (name === null) continue
      const group = table.groups.find((g) => g.group === name)
      for (const s of group?.skills ?? []) {
        if (ordinary.has(s.skillId)) {
          u.push({ pattern: k, slot, skillId: s.skillId, level: s.level, col: alloc() })
        }
      }
      slot++
    }
  })
  return {
    v,
    u,
    maxRarity: Math.max(0, ...table.patterns.map((p) => p.rarity)),
    maxLevel: Math.max(0, ...table.groups.flatMap((g) => g.skills.map((s) => s.level))),
  }
}

/** 護石はちょうど 1 つ・選んだパターンの枠にだけ 1 枠 1 スキル・同じスキルは 1 つまで */
export function lotteryRows(
  lot: LotteryCols,
  ordinary: ReadonlySet<SkillId>,
  infinity: number,
): Row[] {
  const rows: Row[] = [
    sparseRow(
      1,
      1,
      lot.v.map((c): [number, number] => [c.col, 1]),
    ),
  ]
  // 枠（パターン k の i 番目）ごとに、その枠へ入れる u の列
  const bySlot = new Map<string, UCol[]>()
  for (const c of lot.u) {
    const key = `${c.pattern}:${c.slot}`
    bySlot.set(key, [...(bySlot.get(key) ?? []), c])
  }
  for (const cols of bySlot.values()) {
    const pattern = cols[0]?.pattern
    rows.push(
      sparseRow(-infinity, 0, [
        ...cols.map((c): [number, number] => [c.col, 1]),
        ...lot.v.filter((c) => c.pattern === pattern).map((c): [number, number] => [c.col, -1]),
      ]),
    )
  }
  for (const skillId of ordinary) {
    const cols = lot.u.filter((c) => c.skillId === skillId)
    if (cols.length > 0) {
      rows.push(
        sparseRow(
          -infinity,
          1,
          cols.map((c): [number, number] => [c.col, 1]),
        ),
      )
    }
  }
  return rows
}

/** 通常のスキルの行への係数: u のレベル */
export function lotteryLevelTerms(lot: LotteryCols, skillId: SkillId): [number, number][] {
  return lot.u.filter((c) => c.skillId === skillId).map((c): [number, number] => [c.col, c.level])
}

/** 配置の行（種別 t・Lv s）への係数: −(選んだスロットの並びの t・Lv s の数) */
export function lotterySlotTerms(
  lot: LotteryCols,
  target: SlotTarget,
  level: number,
): [number, number][] {
  return lot.v.map((c): [number, number] => [
    c.col,
    -c.slots.filter((s) => s.target === target && s.level === level).length,
  ])
}

/**
 * 目的の係数（辞書式）: 要るスキルの数 → レベルの合計 → レア度 → 空き Lv の重み。
 * wr はレア度 1 の重み（既存の主目的の重み c1）。slotValue はスロットの並びの空き Lv の重み。
 */
export function applyLotteryCosts(
  lot: LotteryCols,
  wr: number,
  slotValue: (slots: readonly Slot[]) => number,
  cost: number[],
): void {
  const wl = wr * (lot.maxRarity + 1)
  const wc = wl * (3 * lot.maxLevel + 1)
  for (const c of lot.v) cost[c.col] = slotValue(c.slots) - wr * c.rarity
  for (const c of lot.u) cost[c.col] = -(wc + wl * c.level)
}

/**
 * シード固定の合成データ生成器（機能 001・decisions.md Q2）。
 *
 * 件数は MHDB の実測値に合わせる。分布の形のうち実測に合わせたのは防具のスキル数の平均だけ（重みの節を参照）。
 * 出典: wilds.mhdb.io/en/*（2026-10-03 取得。数値だけをここに書き、MHDB の JSON は取り込まない）
 *   - 防具 714（頭164・胴140・腕135・腰137・脚138）、下位を除くと 582。1部位あたりのスキル数の平均 2.97
 *   - 装飾品 361（武器用 295・防具用 66。スロット Lv 1〜3。スキルを2つ持つもの 173）
 *   - スキル 179（武器 66・防具 71・シリーズ 25・グループ 17。最大 Lv 7）。シリーズ／グループは 001 のスコープ外
 *   - 生産護石 64 種（ランク込みで 187）
 * 同じシードから同じデータを返す。Math.random・現在時刻には依存しない。
 */
import type {
  ArmorId,
  ArmorPart,
  DecorationId,
  SearchInput,
  SkillId,
  SkillLevel,
  Slot,
  SlotLevel,
  SolverArmor,
  SolverCharm,
  SolverDecoration,
  SolverWeapon,
  Uuid,
} from '../../main/types'
import { createRng, type Rng } from './random'

export const PARTS: readonly ArmorPart[] = ['head', 'chest', 'arms', 'waist', 'legs']

export interface DataCounts {
  armorsByPart: Record<ArmorPart, number>
  weaponDecorations: number
  armorDecorations: number
  decorationsWithTwoSkills: number
  weaponSkills: number
  armorSkills: number
  charms: number
}

/** 上位防具 582（714 の各部位を上位の比率 582/714 に按分した件数） */
export const MHDB_COUNTS: DataCounts = {
  armorsByPart: { head: 134, chest: 114, arms: 110, waist: 112, legs: 112 },
  weaponDecorations: 295,
  armorDecorations: 66,
  decorationsWithTwoSkills: 173,
  weaponSkills: 66,
  armorSkills: 71,
  charms: 187,
}

/*
 * 以下の重みのうち、MHDB の実測値に合わせてあるのは防具のスキル数の平均 2.97 だけ。
 * スロット数・スロット Lv・スキル Lv の重みは実測に基づかない仮定の値である
 * （件数は MHDB_COUNTS が実測。分布の形は仮定）。
 */
/** 防具1つのスキル数 1〜5 の重み（平均 2.97。実測値に合わせた） */
const ARMOR_SKILL_COUNT_WEIGHTS = [0.11, 0.25, 0.3, 0.24, 0.1]
/** 防具のスロット数 0〜3 の重み（仮定） */
const ARMOR_SLOT_COUNT_WEIGHTS = [0.15, 0.3, 0.3, 0.25]
/** 護石のスロット数 0〜2 の重み（仮定） */
const CHARM_SLOT_COUNT_WEIGHTS = [0.4, 0.4, 0.2]
/** スロット Lv 1〜3 の重み（仮定） */
const SLOT_LEVEL_WEIGHTS = [0.4, 0.35, 0.25]
/** スキル Lv 1〜3 の重み（仮定） */
const SKILL_LEVEL_WEIGHTS = [0.7, 0.22, 0.08]

export interface SyntheticData {
  armors: SolverArmor[]
  charms: SolverCharm[]
  decorations: SolverDecoration[]
  weapon: SolverWeapon
  armorSkillIds: SkillId[]
  weaponSkillIds: SkillId[]
}

const pad = (n: number) => String(n + 1).padStart(4, '0')

function slotLevel(rng: Rng): SlotLevel {
  return (rng.weighted(SLOT_LEVEL_WEIGHTS) + 1) as SlotLevel
}

function makeSlots(rng: Rng, countWeights: readonly number[]): Slot[] {
  const count = rng.weighted(countWeights)
  return Array.from({ length: count }, () => ({ target: 'armor', level: slotLevel(rng) }))
}

function makeSkills(rng: Rng, pool: readonly SkillId[], count: number): SkillLevel[] {
  return rng
    .shuffle(pool)
    .slice(0, count)
    .map((skillId) => ({ skillId, level: rng.weighted(SKILL_LEVEL_WEIGHTS) + 1 }))
}

function makeArmors(rng: Rng, counts: DataCounts, skillIds: SkillId[]): SolverArmor[] {
  return PARTS.flatMap((part) =>
    Array.from({ length: counts.armorsByPart[part] }, (_, i) => ({
      id: `armor-${part}-${pad(i)}` as ArmorId,
      part,
      slots: makeSlots(rng, ARMOR_SLOT_COUNT_WEIGHTS),
      skills: makeSkills(rng, skillIds, rng.weighted(ARMOR_SKILL_COUNT_WEIGHTS) + 1),
      defense: 50 + rng.int(60),
    })),
  )
}

function makeCharms(rng: Rng, counts: DataCounts, skillIds: SkillId[]): SolverCharm[] {
  return Array.from({ length: counts.charms }, (_, i) => ({
    id: `charm-${pad(i)}` as Uuid,
    slots: makeSlots(rng, CHARM_SLOT_COUNT_WEIGHTS),
    skills: makeSkills(rng, skillIds, rng.chance(0.6) ? 1 : 2),
  }))
}

function makeDecorations(
  rng: Rng,
  counts: DataCounts,
  weaponSkillIds: SkillId[],
  armorSkillIds: SkillId[],
): SolverDecoration[] {
  const total = counts.weaponDecorations + counts.armorDecorations
  const twoSkills = new Set(
    rng
      .shuffle(Array.from({ length: total }, (_, i) => i))
      .slice(0, counts.decorationsWithTwoSkills),
  )
  return Array.from({ length: total }, (_, i) => {
    const target = i < counts.weaponDecorations ? 'weapon' : 'armor'
    const level = slotLevel(rng)
    const pool = target === 'weapon' ? weaponSkillIds : armorSkillIds
    return {
      id: `${target}-deco-${pad(i)}` as DecorationId,
      target,
      slotLevel: level,
      skills: rng
        .shuffle(pool)
        .slice(0, twoSkills.has(i) ? 2 : 1)
        .map((skillId) => ({ skillId, level: level === 3 && rng.chance(0.3) ? 2 : 1 })),
    }
  })
}

export function generateData(seed: number, counts: DataCounts = MHDB_COUNTS): SyntheticData {
  const rng = createRng(seed)
  const armorSkillIds = Array.from(
    { length: counts.armorSkills },
    (_, i) => `skill-a-${pad(i)}` as SkillId,
  )
  const weaponSkillIds = Array.from(
    { length: counts.weaponSkills },
    (_, i) => `skill-w-${pad(i)}` as SkillId,
  )
  const armors = makeArmors(rng, counts, armorSkillIds)
  const charms = makeCharms(rng, counts, armorSkillIds)
  const decorations = makeDecorations(rng, counts, weaponSkillIds, armorSkillIds)
  const weapon: SolverWeapon = {
    slots: [
      { target: 'weapon', level: 3 },
      { target: 'weapon', level: slotLevel(rng) },
    ],
    skills: makeSkills(rng, weaponSkillIds, 1),
  }
  return { armors, charms, decorations, weapon, armorSkillIds, weaponSkillIds }
}

/** 候補の全体と必須スキルから検索の入力を作る */
export function toInput(
  data: SyntheticData,
  required: SkillLevel[],
  maxResults?: number,
): SearchInput {
  return {
    required,
    armors: data.armors,
    charms: data.charms,
    weapon: data.weapon,
    decorations: data.decorations,
    ...(maxResults === undefined ? {} : { maxResults }),
  }
}

function addLevels(levels: Map<SkillId, number>, skills: readonly SkillLevel[]) {
  for (const s of skills) levels.set(s.skillId, (levels.get(s.skillId) ?? 0) + s.level)
}

/** 解ありのケース: 無作為に選んだ構成の発動スキルから、k 個の必須スキルと下限を取る（解の存在を構成で保証する） */
export function makeFeasibleRequired(data: SyntheticData, seed: number, k: number): SkillLevel[] {
  const rng = createRng(seed)
  for (let attempt = 0; attempt < 1000; attempt++) {
    const levels = new Map<SkillId, number>()
    addLevels(levels, data.weapon.skills)
    const slots: Slot[] = [...data.weapon.slots]
    const charm = rng.pick(data.charms)
    addLevels(levels, charm.skills)
    slots.push(...charm.slots)
    for (const part of PARTS) {
      const armor = rng.pick(data.armors.filter((a) => a.part === part))
      addLevels(levels, armor.skills)
      slots.push(...armor.slots)
    }
    for (const slot of slots) {
      if (!rng.chance(0.8)) continue
      const fits = data.decorations.filter(
        (d) => d.target === slot.target && d.slotLevel <= slot.level,
      )
      addLevels(levels, rng.pick(fits).skills)
    }
    const active = [...levels].filter(([, level]) => level > 0)
    if (active.length < k) continue
    return rng
      .shuffle(active)
      .slice(0, k)
      .map(([skillId, level]) => ({ skillId, level }))
  }
  throw new Error(`k=${k} の解ありのケースを作れなかった`)
}

/** スキル1つだけを最大にする構成（防具・護石を最大レベルのものに、全スロットを最良の装飾品で埋める）が届くレベル */
function singleSkillReach(data: SyntheticData, skillId: SkillId): number {
  const levelOf = (skills: readonly SkillLevel[]) =>
    skills.filter((s) => s.skillId === skillId).reduce((sum, s) => sum + s.level, 0)
  const best = <T extends { skills: SkillLevel[] }>(items: readonly T[]) =>
    items.reduce((a, b) => (levelOf(b.skills) > levelOf(a.skills) ? b : a))
  const picked = [
    ...PARTS.map((p) => best(data.armors.filter((a) => a.part === p))),
    best(data.charms),
  ]
  const slots = [...data.weapon.slots, ...picked.flatMap((p) => p.slots)]
  let reach = levelOf(data.weapon.skills) + picked.reduce((sum, p) => sum + levelOf(p.skills), 0)
  for (const slot of slots) {
    const fits = data.decorations.filter(
      (d) => d.target === slot.target && d.slotLevel <= slot.level,
    )
    reach += Math.max(0, ...fits.map((d) => levelOf(d.skills)))
  }
  return reach
}

/** スキルの最大 Lv（decisions.md Q2: MHDB の実測で 7） */
const MAX_SKILL_LEVEL = 7

/**
 * 解なしのケース: 必須スキルの下限をすべて現実的な最大 Lv（7）にする。
 * 各スキルは単独では 7 に届く（singleSkillReach >= 7 のものだけを選ぶ）が、届く構成は
 * 互いに別の防具・スロットを使うので、組み合わせとしては満たせない。
 * 競合を強めるため、単独で届きにくい（singleSkillReach の小さい）スキルの上位 1.5k 個から k 個を選ぶ。
 * 下限を単独の到達値そのもの（9〜29）に置くと、Lv の最大 7 を超えて非現実的になる。
 * 満たせないことの確認は呼び出し側（searchBuilds の結果）が行う（k が小さいと満たせる組もある）。
 */
export function makeInfeasibleRequired(data: SyntheticData, seed: number, k: number): SkillLevel[] {
  const rng = createRng(seed)
  const scarce = data.armorSkillIds
    .map((skillId) => ({ skillId, reach: singleSkillReach(data, skillId) }))
    .filter((s) => s.reach >= MAX_SKILL_LEVEL)
    .sort((a, b) => a.reach - b.reach)
    .slice(0, Math.ceil(k * 1.5))
  if (scarce.length < k) throw new Error(`k=${k} の解なしのケースを作れなかった`)
  return rng
    .shuffle(scarce)
    .slice(0, k)
    .map(({ skillId }) => ({ skillId, level: MAX_SKILL_LEVEL }))
}

import type {
  MasterArmor,
  MasterBundle,
  MasterDecoration,
  SetBonusId,
  SkillId,
  SkillLevel,
  Slot,
} from '@swv/data'
import { damageTargets } from './damageModel'
import type { SolverCharm, SolverRequest } from './request'
import { findSetBonus, isSetSkill, skillLevelOf } from './skills'
import { PARTS } from './validate'

/** 候補の比較に関係するスキル。必須スキルと期待値の対象のスキル（plan D4） */
export interface RelevantSkills {
  ordinary: SkillId[]
  bonuses: SetBonusId[]
}

/** 候補の比較に使う属性（関係するスキルのレベル・所属・種別ごとのスロット Lv の降順） */
export interface Profile {
  levels: number[]
  sets: boolean[]
  weaponSlots: number[]
  armorSlots: number[]
}

export function relevantSkills(master: MasterBundle, request: SolverRequest): RelevantSkills {
  const ordinary = new Set<SkillId>()
  const bonuses = new Set<SetBonusId>()
  for (const t of damageTargets(master, request)) {
    if (t.bonus === undefined) ordinary.add(t.skill.id)
    else bonuses.add(t.bonus.id)
  }
  for (const r of request.required) {
    if (!isSetSkill(master.skills.find((s) => s.id === r.skillId))) {
      ordinary.add(r.skillId)
      continue
    }
    const bonus = findSetBonus(master, r.skillId)
    if (bonus !== undefined) bonuses.add(bonus.id)
  }
  return { ordinary: [...ordinary], bonuses: [...bonuses] }
}

function slotVector(slots: readonly Slot[], target: Slot['target']): number[] {
  return slots
    .filter((s) => s.target === target)
    .map((s) => s.level)
    .sort((a, b) => b - a)
}

export function profileOf(
  rel: RelevantSkills,
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

/** 要素ごとに x <= y（足りない側は 0 とみなす） */
function vectorLe(x: readonly number[], y: readonly number[]): boolean {
  return x.every((v, i) => v <= (y[i] ?? 0))
}

/** x が y に支配される（x の関係する属性がすべて y 以下） */
export function profileLe(x: Profile, y: Profile): boolean {
  return (
    vectorLe(x.levels, y.levels) &&
    x.sets.every((has, i) => !has || y.sets[i] === true) &&
    vectorLe(x.weaponSlots, y.weaponSlots) &&
    vectorLe(x.armorSlots, y.armorSlots)
  )
}

/** 支配される要素を外す。互いに支配し合うものは並びの最初だけ残す */
export function undominated<T>(items: readonly T[], dominates: (a: T, b: T) => boolean): T[] {
  return items.filter(
    (x, i) => !items.some((y, j) => j !== i && dominates(x, y) && (!dominates(y, x) || j < i)),
  )
}

/** 固定・除外を適用した後の防具の候補 */
function armorPool(master: MasterBundle, request: SolverRequest): MasterArmor[] {
  const fixed = request.fixedArmor ?? {}
  const excluded = new Set<string>(request.excludedArmorIds ?? [])
  return PARTS.flatMap((part) => {
    const id = fixed[part]
    if (id === null) return []
    return master.armors.filter(
      (a) => a.part === part && (id === undefined ? !excluded.has(a.id) : a.id === id),
    )
  })
}

function reduceArmors(
  master: MasterBundle,
  request: SolverRequest,
  rel: RelevantSkills,
): MasterArmor[] {
  const pool = armorPool(master, request)
  const profiles = new Map(
    pool.map((a) => [a, profileOf(rel, a.skills, a.setBonusIds, a.slots)] as const),
  )
  return undominated(pool, (x, y) => {
    const px = profiles.get(x)
    const py = profiles.get(y)
    return x.part === y.part && px !== undefined && py !== undefined && profileLe(px, py)
  })
}

function reduceDecorations(
  master: MasterBundle,
  request: SolverRequest,
  rel: RelevantSkills,
): MasterDecoration[] {
  const excluded = new Set<string>(request.excludedDecorationIds ?? [])
  const levels = (d: MasterDecoration) => rel.ordinary.map((id) => skillLevelOf(d.skills, id))
  return undominated(
    master.decorations.filter((d) => !excluded.has(d.id)),
    (x, y) => x.target === y.target && x.slotLevel >= y.slotLevel && vectorLe(levels(x), levels(y)),
  )
}

/** 生産護石（ID がマスターの charms にある）だけを比べる。鑑定護石はそのまま残す */
function reduceCharms(
  master: MasterBundle,
  request: SolverRequest,
  rel: RelevantSkills,
): SolverCharm[] {
  const masterIds = new Set<string>(master.charms.map((c) => c.id))
  const crafted = request.charms.filter((c) => masterIds.has(c.id))
  const profiles = new Map(crafted.map((c) => [c, profileOf(rel, c.skills, [], c.slots)] as const))
  const kept = new Set<SolverCharm>(
    undominated(crafted, (x, y) => {
      const px = profiles.get(x)
      const py = profiles.get(y)
      return px !== undefined && py !== undefined && profileLe(px, py)
    }),
  )
  return request.charms.filter((c) => !masterIds.has(c.id) || kept.has(c))
}

/**
 * expectedDamage の候補から、支配される防具・装飾品・生産護石を外す（plan D4）。
 * 固定・除外を適用した後の候補の中で判定する。返すマスターと要求は求解のモデルの組み立て専用。
 */
export function reduceCandidates(
  master: MasterBundle,
  request: SolverRequest,
): { master: MasterBundle; request: SolverRequest } {
  const rel = relevantSkills(master, request)
  return {
    master: {
      ...master,
      armors: reduceArmors(master, request, rel),
      decorations: reduceDecorations(master, request, rel),
    },
    request: { ...request, charms: reduceCharms(master, request, rel) },
  }
}

import type {
  ArmorPart,
  MasterArmor,
  MasterBundle,
  MasterDecoration,
  SkillId,
  Slot,
} from '@swv/data'
import type { SolvedBuild, SolverCharm, SolverRequest } from '../../main/request'
import { PARTS } from './builders'
import { referenceDamage } from './damageReference'

/** 総当たりで数えた構成 1 件（防具・護石の組と、装飾品の付け方ごと） */
export interface BruteConfig {
  /** 防具と護石の組（ソルバーの除外の単位） */
  key: string
  expected: number
  armorFree: number
  weaponFree: number
}

interface Gear {
  weapon: { slots: Slot[]; skills: { skillId: SkillId; level: number }[]; setBonusIds: string[] }
  attack: number
  affinity: number
}

function weaponOf(master: MasterBundle, request: SolverRequest): Gear {
  const w = request.weapon
  if (w.kind === 'custom') return { weapon: w, attack: w.attack, affinity: w.affinity }
  const found = master.weapons.find((m) => m.id === w.weaponId)
  if (found === undefined) throw new Error('武器が無い')
  return { weapon: found, attack: found.attack, affinity: found.affinity }
}

/** 部位ごとの防具の組（全部位とも 1 つ選ぶ。固定・除外は使わない） */
function armorCombos(master: MasterBundle): MasterArmor[][] {
  let combos: MasterArmor[][] = [[]]
  for (const part of PARTS) {
    const options = master.armors.filter((a) => a.part === part)
    combos = combos.flatMap((c) => options.map((o) => [...c, o]))
  }
  return combos
}

/** スキルのレベル（通常は合計を最大レベルで頭打ち、シリーズ／グループは部位数の段） */
function levelsOf(
  master: MasterBundle,
  gear: Gear,
  armors: readonly MasterArmor[],
  charm: SolverCharm | null,
  decos: readonly MasterDecoration[],
): Map<SkillId, number> {
  const raw = new Map<SkillId, number>()
  const add = (skills: readonly { skillId: SkillId; level: number }[]) => {
    for (const s of skills) raw.set(s.skillId, (raw.get(s.skillId) ?? 0) + s.level)
  }
  add(gear.weapon.skills)
  for (const a of armors) add(a.skills)
  add(charm?.skills ?? [])
  for (const d of decos) add(d.skills)
  const levels = new Map<SkillId, number>()
  for (const s of master.skills) {
    if (s.kind === 'series' || s.kind === 'group') {
      const bonus = master.setBonuses.find((b) => b.skillId === s.id)
      const pieces =
        (bonus !== undefined && gear.weapon.setBonusIds.includes(bonus.id) ? 1 : 0) +
        armors.filter((a) => bonus !== undefined && a.setBonusIds.includes(bonus.id)).length
      levels.set(
        s.id,
        Math.max(
          0,
          ...(bonus?.thresholds.filter((t) => pieces >= t.pieces).map((t) => t.level) ?? []),
        ),
      )
    } else {
      levels.set(s.id, Math.min(raw.get(s.id) ?? 0, s.maxLevel))
    }
  }
  return levels
}

/**
 * 全構成（防具・護石・装飾品の付け方）を総当たりして、必須スキルの下限を満たすものを数える。
 * スロットごとに「付けない」か「入る装飾品」を選ぶ。ソルバーの実装を使わない。
 */
export function bruteForce(master: MasterBundle, request: SolverRequest): BruteConfig[] {
  const gear = weaponOf(master, request)
  const charms: (SolverCharm | null)[] = request.charms.length === 0 ? [null] : request.charms
  const result: BruteConfig[] = []
  for (const armors of armorCombos(master)) {
    for (const charm of charms) {
      const slots = [
        ...gear.weapon.slots,
        ...armors.flatMap((a) => a.slots),
        ...(charm?.slots ?? []),
      ]
      const key = `${armors.map((a) => a.id).join(',')}|${charm?.id ?? ''}`
      const chosen: MasterDecoration[] = []
      const visit = (index: number, armorFree: number, weaponFree: number) => {
        const slot = slots[index]
        if (slot === undefined) {
          const levels = levelsOf(master, gear, armors, charm, chosen)
          if (request.required.some((r) => (levels.get(r.skillId) ?? 0) < r.level)) return
          const expected = referenceDamage(
            master,
            { attack: gear.attack, affinity: gear.affinity },
            levels,
            request.activeConditionIds ?? [],
          )
          result.push({ key, expected, armorFree, weaponFree })
          return
        }
        // 付けないスロットは、その Lv の分だけ空き Lv が増える。装飾品を付けたスロットは空きにならない
        visit(
          index + 1,
          armorFree + (slot.target === 'armor' ? slot.level : 0),
          weaponFree + (slot.target === 'weapon' ? slot.level : 0),
        )
        for (const d of master.decorations) {
          if (d.target !== slot.target || d.slotLevel > slot.level) continue
          chosen.push(d)
          visit(index + 1, armorFree, weaponFree)
          chosen.pop()
        }
      }
      visit(0, 0, 0)
    }
  }
  return result
}

/** 返した構成の防具・護石の組のキー（bruteForce の key と同じ形） */
export function buildKey(build: SolvedBuild): string {
  return `${PARTS.map((p) => build.armor[p]).join(',')}|${build.charmId ?? ''}`
}

/** 返した構成の空き Lv（防具用・武器用）。空きスロットの参照から数え直す */
export function freeLevels(
  master: MasterBundle,
  request: SolverRequest,
  build: SolvedBuild,
): { armor: number; weapon: number } {
  const gear = weaponOf(master, request)
  const slotsOf = (owner: string): Slot[] => {
    if (owner === 'weapon') return gear.weapon.slots
    if (owner === 'charm') return request.charms.find((c) => c.id === build.charmId)?.slots ?? []
    const id = build.armor[owner as ArmorPart]
    return master.armors.find((a) => a.id === id)?.slots ?? []
  }
  const sum = { armor: 0, weapon: 0 }
  for (const ref of build.freeSlots) {
    const slot = slotsOf(ref.owner)[ref.index]
    if (slot !== undefined) sum[slot.target] += slot.level
  }
  return sum
}

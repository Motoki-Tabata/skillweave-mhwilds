import type { MasterBundle, SetBonus, SkillId, SkillLevel, Slot, SlotTarget } from '@swv/data'
import type { Selection } from './model'
import type { Objective, SlotOwner, SlotRef, SolvedBuild } from './request'
import { findSetBonus, isSetSkill, setBonusLevel } from './skills'
import { PARTS, type ResolvedWeapon } from './validate'

interface SlotEntry {
  ref: SlotRef
  target: SlotTarget
  level: number
  used: boolean
}

const TARGETS: readonly SlotTarget[] = ['weapon', 'armor']

/** 持ち主の順（weapon→head→chest→arms→waist→legs→charm）、次に添字の順にスロットを並べる */
function listSlots(weapon: ResolvedWeapon, selection: Selection): SlotEntry[] {
  const owners: { owner: SlotOwner; slots: readonly Slot[] }[] = [
    { owner: 'weapon', slots: weapon.slots },
    ...PARTS.map((part) => ({ owner: part, slots: selection.armor[part]?.slots ?? [] })),
    { owner: 'charm', slots: selection.charm?.slots ?? [] },
  ]
  return owners.flatMap(({ owner, slots }) =>
    slots.map((s, index): SlotEntry => ({
      ref: { owner, index },
      target: s.target,
      level: s.level,
      used: false,
    })),
  )
}

/**
 * 装飾品を付ける。種別ごとに Lv の大きい順（同じ Lv はマスターの並び順）に、
 * 入る中で最も Lv の小さい空きスロットへ付ける。同じ Lv は持ち主の順、添字の順。
 */
function placeDecorations(
  entries: SlotEntry[],
  decorations: Selection['decorations'],
): SolvedBuild['decorations'] {
  const placed: SolvedBuild['decorations'] = []
  for (const target of TARGETS) {
    const slots = entries.filter((e) => e.target === target).sort((a, b) => a.level - b.level)
    const queue = decorations
      .filter((d) => d.deco.target === target)
      .sort((a, b) => b.deco.slotLevel - a.deco.slotLevel)
    for (const { deco, count } of queue) {
      for (let i = 0; i < count; i++) {
        const slot = slots.find((s) => !s.used && s.level >= deco.slotLevel)
        if (slot === undefined) {
          throw new Error(
            `装飾品 ${deco.id}（Lv${deco.slotLevel}・${target}）を付けるスロットが無い（ILP と配置の不整合）`,
          )
        }
        slot.used = true
        placed.push({ slot: slot.ref, decorationId: deco.id })
      }
    }
  }
  return placed
}

function pieceCount(bonus: SetBonus, weapon: ResolvedWeapon, selection: Selection): number {
  let pieces = weapon.setBonusIds.includes(bonus.id) ? 1 : 0
  for (const part of PARTS) {
    if (selection.armor[part]?.setBonusIds.includes(bonus.id)) pieces++
  }
  return pieces
}

/** 発動スキル。防具・武器・護石・装飾品の合計を rawLevel、maxLevel で頭打ちして level。レベル 0 は入れない */
function activeSkills(
  master: MasterBundle,
  weapon: ResolvedWeapon,
  selection: Selection,
): SolvedBuild['skills'] {
  const raw = new Map<SkillId, number>()
  const add = (skills: readonly SkillLevel[], times = 1) => {
    for (const s of skills) raw.set(s.skillId, (raw.get(s.skillId) ?? 0) + s.level * times)
  }
  add(weapon.skills)
  for (const part of PARTS) add(selection.armor[part]?.skills ?? [])
  add(selection.charm?.skills ?? [])
  for (const { deco, count } of selection.decorations) add(deco.skills, count)

  const result: SolvedBuild['skills'] = []
  for (const skill of master.skills) {
    if (isSetSkill(skill)) {
      const bonus = findSetBonus(master, skill.id)
      const level =
        bonus === undefined ? 0 : setBonusLevel(bonus, pieceCount(bonus, weapon, selection))
      if (level > 0) result.push({ skillId: skill.id, level, rawLevel: level })
      continue
    }
    const rawLevel = raw.get(skill.id) ?? 0
    if (rawLevel > 0) {
      result.push({ skillId: skill.id, level: Math.min(rawLevel, skill.maxLevel), rawLevel })
    }
  }
  return result
}

/** 選ばれた防具・護石・装飾品の個数から、配置・空きスロット・発動スキルを持つ構成を作る */
export function assembleBuild(
  master: MasterBundle,
  weapon: ResolvedWeapon,
  selection: Selection,
  objective: Objective,
): SolvedBuild {
  const all = listSlots(weapon, selection)
  const decorations = placeDecorations(all, selection.decorations)
  const free = all.filter((e) => !e.used)
  const freeLevel = (target: SlotTarget) =>
    free.filter((e) => e.target === target).reduce((sum, e) => sum + e.level, 0)

  const build: SolvedBuild = {
    armor: {
      head: selection.armor.head?.id ?? null,
      chest: selection.armor.chest?.id ?? null,
      arms: selection.armor.arms?.id ?? null,
      waist: selection.armor.waist?.id ?? null,
      legs: selection.armor.legs?.id ?? null,
    },
    charmId: selection.charm?.id ?? null,
    decorations,
    skills: activeSkills(master, weapon, selection),
    freeSlots: free.map((e) => e.ref),
  }
  if (objective.kind === 'maximize' && objective.metric === 'freeSlots') {
    build.freeSlotLevels = { armor: freeLevel('armor'), weapon: freeLevel('weapon') }
    build.score = build.freeSlotLevels.armor
  } else if (objective.kind === 'maximize') {
    build.score = PARTS.reduce((sum, part) => sum + (selection.armor[part]?.defense ?? 0), 0)
  }
  return build
}

import type { ArmorPart, FoundBuild, SearchInput, SkillLevel, Slot } from '../../main/types'
import { PARTS } from './syntheticData'

function addLevels(levels: Map<string, number>, skills: readonly SkillLevel[], times = 1) {
  for (const s of skills) levels.set(s.skillId, (levels.get(s.skillId) ?? 0) + s.level * times)
}

/**
 * ソルバーと独立に構成を検算する（plan 決定事項 11）。違反の説明の配列を返す（空なら合格）。
 * - 防具・護石・装飾品が候補にあり、部位が合っている
 * - 武器・防具・護石・装飾品から数え直した必須スキルのレベルが下限以上
 * - 装飾品を大きい順に、入る中で最も小さい空きスロットへ割り当てて、すべて配置できる
 */
export function verifyBuild(input: SearchInput, build: FoundBuild): string[] {
  const problems: string[] = []
  const levels = new Map<string, number>()
  addLevels(levels, input.weapon.skills)
  const slots: Slot[] = [...input.weapon.slots]
  let defense = 0

  for (const part of PARTS) {
    const armor = input.armors.find((a) => a.id === build.armor[part])
    if (armor?.part !== part) {
      problems.push(`部位 ${part} の防具 ${build.armor[part]} が候補に無いか部位が違う`)
      continue
    }
    addLevels(levels, armor.skills)
    slots.push(...armor.slots)
    defense += armor.defense
  }
  if (defense !== build.defense) problems.push(`防御力 ${build.defense} は合計 ${defense} と違う`)

  if (build.charmId === null) {
    if (input.charms.length > 0) problems.push('護石の候補があるのに護石を選んでいない')
  } else {
    const charm = input.charms.find((c) => c.id === build.charmId)
    if (charm === undefined) problems.push(`護石 ${build.charmId} が候補に無い`)
    else {
      addLevels(levels, charm.skills)
      slots.push(...charm.slots)
    }
  }

  const placed: { target: Slot['target']; level: number }[] = []
  for (const { decorationId, count } of build.decorations) {
    const deco = input.decorations.find((d) => d.id === decorationId)
    if (deco === undefined || !Number.isInteger(count) || count <= 0) {
      problems.push(`装飾品 ${decorationId}（${count} 個）が不正`)
      continue
    }
    addLevels(levels, deco.skills, count)
    for (let i = 0; i < count; i++) placed.push({ target: deco.target, level: deco.slotLevel })
  }

  for (const req of input.required) {
    const actual = levels.get(req.skillId) ?? 0
    if (actual < req.level) problems.push(`${req.skillId} は ${actual} で下限 ${req.level} 未満`)
  }

  const free = slots.map((s) => ({ ...s, used: false }))
  for (const deco of placed.sort((a, b) => b.level - a.level)) {
    const target = free
      .filter((s) => !s.used && s.target === deco.target && s.level >= deco.level)
      .sort((a, b) => a.level - b.level)[0]
    if (target === undefined) problems.push(`${deco.target} 用 Lv${deco.level} の装飾品を置けない`)
    else target.used = true
  }
  return problems
}

/** 防具と護石の組を表すキー（重複の検査に使う） */
export function armorCharmKey(build: FoundBuild): string {
  const armor = PARTS.map((p: ArmorPart) => build.armor[p]).join(',')
  return `${armor}|${build.charmId ?? ''}`
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MasterBundle } from '@swv/data'
import { WEAPON_TYPES, weaponTypeName, weaponTypeOrder } from '@/constants/weaponTypes'
import { ARMOR_RANKS, SKILL_KINDS, armorRankLabel, skillKindLabel } from '@/constants/labels'

// 受入基準 3・4・5（定数が現行マスターを覆う）。現行の版は vite.config.ts が埋め込む __SWV_MASTER__ が正。
const master = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      `../../../../../packages/data/dist/master-${__SWV_MASTER__.version}.json`,
    ),
    'utf-8',
  ),
) as MasterBundle

describe('定数が現行のマスターを覆う', () => {
  it('マスターのすべての武器種に、正式名と短い表示名がある', () => {
    const types = new Set(master.weapons.map((w) => w.weaponType))
    expect(types.size).toBeGreaterThan(0)
    const defined = new Set(WEAPON_TYPES.map((t) => t.id))
    for (const type of types) expect(defined, `武器種 ${type}`).toContain(type)
    for (const t of WEAPON_TYPES) {
      expect(t.name).not.toBe('')
      expect(t.shortName).not.toBe('')
    }
  })

  it('マスターのすべてのランクに表示名がある', () => {
    const ranks = new Set(master.armors.map((a) => a.rank))
    const defined = new Set(ARMOR_RANKS.map((r) => r.id))
    for (const rank of ranks) expect(defined, `ランク ${rank}`).toContain(rank)
  })

  it('マスターのすべてのスキルの種類に表示名がある', () => {
    const kinds = new Set(master.skills.map((s) => s.kind))
    const defined = new Set(SKILL_KINDS.map((k) => k.id))
    for (const kind of kinds) expect(defined, `スキルの種類 ${kind}`).toContain(kind)
  })
})

describe('定数の補助関数', () => {
  it('武器種の正式名と並び順。定数に無い値は kind のまま・末尾', () => {
    expect(weaponTypeName('gunlance')).toBe('ガンランス')
    expect(weaponTypeName('unknown')).toBe('unknown')
    expect(weaponTypeOrder('great-sword')).toBe(0)
    expect(weaponTypeOrder('bow')).toBe(WEAPON_TYPES.length - 1)
    expect(weaponTypeOrder('unknown')).toBe(WEAPON_TYPES.length)
  })

  it('ランクは低い順（末尾が最も高い）。スキルの種類は武器・防具・シリーズ・グループの順', () => {
    expect(ARMOR_RANKS.map((r) => r.id)).toEqual(['low', 'high', 'master'])
    expect(SKILL_KINDS.map((k) => k.label)).toEqual(['武器', '防具', 'シリーズ', 'グループ'])
  })

  it('表示名の引き当て。定数に無い値はそのまま', () => {
    expect(armorRankLabel('high')).toBe('上位')
    expect(skillKindLabel('series')).toBe('シリーズ')
    expect(armorRankLabel('x' as never)).toBe('x')
    expect(skillKindLabel('x' as never)).toBe('x')
  })
})

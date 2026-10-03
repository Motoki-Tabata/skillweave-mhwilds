import type { MasterBundle, MasterDictionary } from '../index.ts'
import { compareCodeUnits } from './sort.ts'

/** オブジェクトのキーを再帰的にコードユニット順にそろえる。配列の順序は変えない */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort(compareCodeUnits)
        .map((key) => [key, sortKeys(record[key])]),
    )
  }
  return value
}

const byId = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => compareCodeUnits(a.id, b.id))

const bySkillId = <T extends { skillId: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => compareCodeUnits(a.skillId, b.skillId))

const toText = (value: unknown): string => `${JSON.stringify(sortKeys(value), null, 2)}\n`

/** `MasterBundle` を、入力の順序に依らず同じバイト列になる JSON にする */
export function serializeBundle(bundle: MasterBundle): string {
  const sorted: MasterBundle = {
    ...bundle,
    skills: byId(bundle.skills),
    setBonuses: byId(bundle.setBonuses).map((setBonus) => ({
      ...setBonus,
      thresholds: [...setBonus.thresholds].sort((a, b) => a.pieces - b.pieces),
    })),
    armors: byId(bundle.armors).map((armor) => ({
      ...armor,
      skills: bySkillId(armor.skills),
      setBonusIds: [...armor.setBonusIds].sort(compareCodeUnits),
    })),
    decorations: byId(bundle.decorations).map((decoration) => ({
      ...decoration,
      skills: bySkillId(decoration.skills),
    })),
    weapons: byId(bundle.weapons).map((weapon) => ({
      ...weapon,
      skills: bySkillId(weapon.skills),
      setBonusIds: [...weapon.setBonusIds].sort(compareCodeUnits),
    })),
    charms: byId(bundle.charms).map((charm) => ({ ...charm, skills: bySkillId(charm.skills) })),
  }
  return toText(sorted)
}

/** 辞書を、ID（キー）の昇順の JSON にする */
export function serializeDictionary(dictionary: MasterDictionary): string {
  return toText(dictionary)
}

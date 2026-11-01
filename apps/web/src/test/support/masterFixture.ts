import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MasterBundle, MasterDictionary } from '@swv/data'

// 現行の版は vite.config.ts が埋め込む __SWV_MASTER__ が正。実データのマスターと ja 辞書を読む。
const dist = join(import.meta.dirname, '../../../../../packages/data/dist')

export const bundle = JSON.parse(
  readFileSync(join(dist, `master-${__SWV_MASTER__.version}.json`), 'utf-8'),
) as MasterBundle

export const dictionary = JSON.parse(
  readFileSync(join(dist, `master-${__SWV_MASTER__.version}.ja.json`), 'utf-8'),
) as MasterDictionary

/** 辞書の名前からスキルの ID と最大 Lv を引く（護石に付くスキルのみ）。 */
export function skillByName(name: string): { id: string; maxLevel: number } {
  const skill = bundle.skills.find((s) => dictionary.entries[s.id]?.name === name)
  if (!skill) throw new Error(`スキルが見つかりません: ${name}`)
  return { id: skill.id, maxLevel: skill.maxLevel }
}

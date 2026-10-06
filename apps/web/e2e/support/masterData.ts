import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `packages/data/dist/` の現行のマスターと ja の辞書を、テストから node:fs で読む。
 * 版が上がっても追従できるよう、武器・スキルの名前は辞書から引く（名前を直書きしない）。
 */
const DIST_DIR = join(import.meta.dirname, '../../../../packages/data/dist')
const MASTER_FILE = /^master-[^.]+(\.[^.]+)*\.json$/
const DICTIONARY_FILE = /\.(ja|en)\.json$/

interface RawMaster {
  version: string
  weapons: { id: string; skills: unknown[]; setBonusIds: unknown[] }[]
  skills: { id: string; kind: string; maxLevel: number }[]
}

interface Dictionary {
  entries: Record<string, { name: string }>
}

export interface MasterInfo {
  version: string
  /** 辞書から ID の名前を引く。無ければ例外 */
  nameOf: (id: string) => string
  /** スキルの最大レベル。マスターに無ければ例外 */
  maxLevelOf: (skillId: string) => number
  /** スキルを持たず、シリーズ／グループスキルも持たない、マスターの先頭の武器の ID */
  plainWeaponId: string
}

export function loadMasterInfo(): MasterInfo {
  const files = readdirSync(DIST_DIR).filter((f) => MASTER_FILE.test(f) && !DICTIONARY_FILE.test(f))
  const [file, ...rest] = files
  if (file === undefined || rest.length > 0) {
    throw new Error(`packages/data/dist/ のマスターがちょうど 1 つではない: [${files}]`)
  }
  const master = JSON.parse(readFileSync(join(DIST_DIR, file), 'utf8')) as RawMaster
  const dictionary = JSON.parse(
    readFileSync(join(DIST_DIR, `master-${master.version}.ja.json`), 'utf8'),
  ) as Dictionary

  const plain = master.weapons.find((w) => w.skills.length === 0 && w.setBonusIds.length === 0)
  if (plain === undefined) throw new Error('スキルを持たないマスターの武器が無い')

  return {
    version: master.version,
    nameOf: (id) => {
      const entry = dictionary.entries[id]
      if (entry === undefined) throw new Error(`辞書に ${id} の名前が無い`)
      return entry.name
    },
    maxLevelOf: (skillId) => {
      const skill = master.skills.find((s) => s.id === skillId)
      if (skill === undefined) throw new Error(`マスターに ${skillId} が無い`)
      return skill.maxLevel
    },
    plainWeaponId: plain.id,
  }
}

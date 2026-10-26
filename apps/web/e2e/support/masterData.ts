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
  armors: { part: string; rank: string; setBonusIds: string[] }[]
  setBonuses: { id: string; skillId: string; thresholds: { level: number; pieces: number }[] }[]
}

/** 武器の付与スキルがあって初めて満たせる、シリーズ Lv2 とグループ Lv1 の組（上位の防具のみ）。 */
export interface GrantPair {
  seriesName: string
  groupName: string
}

interface Dictionary {
  entries: Record<string, { name: string; reading?: string }>
}

export interface MasterInfo {
  version: string
  /** 辞書から ID の名前を引く。無ければ例外 */
  nameOf: (id: string) => string
  /** スキルの最大レベル。マスターに無ければ例外 */
  maxLevelOf: (skillId: string) => number
  /** スキルを持たず、シリーズ／グループスキルも持たない、マスターの先頭の武器の ID */
  plainWeaponId: string
  /** 護石に入れる防具スキルのうち、名前に漢字を含み、読み（ひらがな）があり、名前が一意のもの */
  kanjiArmorSkill: () => { id: string; name: string; reading: string; maxLevel: number }
  /** 基の武器にできる、名前が「アーティア」で始まるマスターの武器の名前（先頭の1つ） */
  artiaWeaponName: () => string
  /** 上位の防具だけではシリーズ Lv2 とグループ Lv1 を両方は満たせず、武器の付与スキルを部位数に数えると満たせる組 */
  grantPair: () => GrantPair
}

/** 防具の部位ごとの (シリーズの部位数, グループの部位数) の選び方で、必要部位数に届く組合せがあるか。 */
function reachable(options: [number, number][][], need: [number, number]): boolean {
  let states = new Set<string>(['0,0'])
  for (const part of options) {
    const next = new Set<string>()
    for (const key of states) {
      const [s = 0, g = 0] = key.split(',').map(Number)
      for (const [ds, dg] of part)
        next.add(`${Math.min(s + ds, need[0])},${Math.min(g + dg, need[1])}`)
    }
    states = next
  }
  return states.has(`${need[0]},${need[1]}`)
}

const HAN = /\p{Script=Han}/u
const HIRAGANA = /^[ぁ-ゖー]+$/u

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

  const kanjiArmorSkill: MasterInfo['kanjiArmorSkill'] = () => {
    const names = Object.values(dictionary.entries).map((e) => e.name)
    for (const skill of master.skills) {
      const entry = dictionary.entries[skill.id]
      if (skill.kind !== 'armor' || entry?.reading === undefined) continue
      const unique = names.filter((n) => n.includes(entry.name)).length === 1
      if (unique && HAN.test(entry.name) && HIRAGANA.test(entry.reading)) {
        return { id: skill.id, name: entry.name, reading: entry.reading, maxLevel: skill.maxLevel }
      }
    }
    throw new Error('条件に合う防具スキルが辞書に無い')
  }

  const artiaWeaponName: MasterInfo['artiaWeaponName'] = () => {
    for (const weapon of master.weapons) {
      const name = dictionary.entries[weapon.id]?.name
      if (name?.startsWith('アーティア') === true) return name
    }
    throw new Error('アーティアで始まる武器が辞書に無い')
  }

  const grantPair: MasterInfo['grantPair'] = () => {
    const kindOf = new Map(master.skills.map((s) => [s.id, s.kind]))
    const bonuses = master.setBonuses
    const series = bonuses.filter(
      (b) => kindOf.get(b.skillId) === 'series' && b.thresholds.length === 2,
    )
    const groups = bonuses.filter(
      (b) => kindOf.get(b.skillId) === 'group' && b.thresholds.length === 1,
    )
    const parts = [...new Set(master.armors.map((a) => a.part))]
    for (const s of series) {
      for (const g of groups) {
        const options = parts.map((part) =>
          [
            ...new Set(
              master.armors
                .filter((a) => a.rank === 'high' && a.part === part)
                .map(
                  (a) =>
                    `${a.setBonusIds.includes(s.id) ? 1 : 0},${a.setBonusIds.includes(g.id) ? 1 : 0}`,
                ),
            ),
          ].map((key) => key.split(',').map(Number) as [number, number]),
        )
        const sNeed = s.thresholds[1]?.pieces ?? 0
        const gNeed = g.thresholds[0]?.pieces ?? 0
        // 防具だけでは届かず、武器が両方を1部位ぶん足すと届く組
        if (!reachable(options, [sNeed, gNeed]) && reachable(options, [sNeed - 1, gNeed - 1])) {
          return { seriesName: dictionaryName(s.skillId), groupName: dictionaryName(g.skillId) }
        }
      }
    }
    throw new Error('武器の付与スキルがあって初めて満たせる組がマスターに無い')
  }

  function dictionaryName(id: string): string {
    const entry = dictionary.entries[id]
    if (entry === undefined) throw new Error(`辞書に ${id} の名前が無い`)
    return entry.name
  }

  return {
    kanjiArmorSkill,
    artiaWeaponName,
    grantPair,
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

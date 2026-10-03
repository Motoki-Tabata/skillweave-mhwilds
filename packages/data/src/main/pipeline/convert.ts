import type {
  ArmorPart,
  DictionaryEntry,
  MasterArmor,
  MasterBundle,
  MasterCharm,
  MasterDecoration,
  MasterDictionary,
  MasterSkill,
  MasterVersion,
  MasterWeapon,
  SetBonus,
  SetBonusId,
  SkillKind,
  SkillLevel,
  Slot,
  SlotLevel,
  SlotTarget,
} from '../index.ts'
import { formatList } from './format.ts'
import { armorId, charmId, decorationId, setBonusId, skillId, weaponId } from './ids.ts'
import type { MhdbArmorSet, MhdbBonus, MhdbInput, MhdbNames, MhdbSkill } from './mhdb.ts'

export interface ConvertConfig {
  repository: string
  commit: string
  version: string
}

type Threshold = SetBonus['thresholds'][number]

/** 同じシリーズ／グループスキルの発動部位数が、防具セットの間で一致しない状態（出力の型には載せない） */
export interface SetBonusMismatch {
  id: SetBonusId
  byArmorSet: { armorSetGameId: number; thresholds: Threshold[] }[]
}

export interface ConvertResult {
  bundle: MasterBundle
  dictionaries: { ja: MasterDictionary; en: MasterDictionary }
  /** オーバーレイが当該 `sb:` の thresholds を置き換えると解消する */
  mismatches: SetBonusMismatch[]
}

const SKILL_KINDS: Record<string, SkillKind> = {
  armor: 'armor',
  weapon: 'weapon',
  set: 'series',
  group: 'group',
}

const ARMOR_PARTS = new Set(['head', 'chest', 'arms', 'waist', 'legs'])

const toSlots = (levels: number[], target: SlotTarget): Slot[] =>
  levels.map((level) => ({ target, level: level as SlotLevel }))

function toSkillLevels(skills: Record<string, number>): SkillLevel[] {
  return Object.entries(skills).map(([gameId, level]) => ({ skillId: skillId(gameId), level }))
}

function toThresholds(bonus: MhdbBonus): Threshold[] {
  return bonus.ranks.map((rank) => ({ pieces: rank.pieces, level: rank.skill_level }))
}

/** 防具セットごとの set_bonus・group_bonus を、スキルの gameId ごとにまとめる */
function collectBonuses(armors: MhdbArmorSet[]): Map<number, SetBonusMismatch['byArmorSet']> {
  const bySkill = new Map<number, SetBonusMismatch['byArmorSet']>()
  for (const armorSet of armors) {
    for (const bonus of [armorSet.set_bonus, armorSet.group_bonus]) {
      if (bonus === null) continue
      const list = bySkill.get(bonus.skill_id) ?? []
      list.push({ armorSetGameId: armorSet.game_id, thresholds: toThresholds(bonus) })
      bySkill.set(bonus.skill_id, list)
    }
  }
  return bySkill
}

function buildSetBonuses(
  skills: MhdbSkill[],
  armors: MhdbArmorSet[],
): { setBonuses: SetBonus[]; mismatches: SetBonusMismatch[] } {
  const bonuses = collectBonuses(armors)
  const setBonuses: SetBonus[] = []
  const mismatches: SetBonusMismatch[] = []
  for (const skill of skills) {
    if (skill.kind !== 'set' && skill.kind !== 'group') continue
    const id = setBonusId(skill.game_id)
    const byArmorSet = bonuses.get(skill.game_id) ?? []
    const first = byArmorSet[0]?.thresholds ?? []
    const key = JSON.stringify(first)
    if (byArmorSet.some((entry) => JSON.stringify(entry.thresholds) !== key)) {
      mismatches.push({ id, byArmorSet })
    }
    setBonuses.push({ id, skillId: skillId(skill.game_id), thresholds: first })
  }
  return { setBonuses, mismatches }
}

/** 部位のスキルを、通常のスキルとシリーズ／グループスキル（`sb:`）に振り分ける */
function splitPieceSkills(
  id: string,
  pieceSkills: Record<string, number>,
  skillKinds: Map<string, string>,
  errors: string[],
): { skills: SkillLevel[]; setBonusIds: SetBonusId[] } {
  const skills: SkillLevel[] = []
  const setBonusIds: SetBonusId[] = []
  for (const [gameId, level] of Object.entries(pieceSkills)) {
    const kind = skillKinds.get(gameId)
    if (kind !== 'set' && kind !== 'group') {
      skills.push({ skillId: skillId(gameId), level })
      continue
    }
    if (level !== 1) {
      errors.push(
        `${id}: シリーズ／グループスキル sk:${gameId} のレベルが 1 ではありません（${level}）`,
      )
    }
    setBonusIds.push(setBonusId(gameId))
  }
  return { skills, setBonusIds }
}

function buildArmors(
  armorSets: MhdbArmorSet[],
  skillKinds: Map<string, string>,
  errors: string[],
): MasterArmor[] {
  const result: MasterArmor[] = []
  for (const armorSet of armorSets) {
    for (const piece of armorSet.pieces) {
      const id = armorId(armorSet.game_id, piece.kind as ArmorPart)
      if (!ARMOR_PARTS.has(piece.kind)) {
        errors.push(
          `${id}: 部位 ${piece.kind} は head・chest・arms・waist・legs のどれでもありません`,
        )
        continue
      }
      const { skills, setBonusIds } = splitPieceSkills(id, piece.skills, skillKinds, errors)
      result.push({
        id,
        part: piece.kind as ArmorPart,
        rarity: armorSet.rarity,
        slots: toSlots(piece.slots, 'armor'),
        skills,
        setBonusIds,
        defense: piece.defense.max,
      })
    }
  }
  return result
}

function buildWeapons(
  input: MhdbInput,
  skillKinds: Map<string, string>,
  errors: string[],
): MasterWeapon[] {
  return input.weapons.map((weapon) => {
    const id = weaponId(weapon.kind, weapon.game_id)
    for (const gameId of Object.keys(weapon.skills)) {
      const kind = skillKinds.get(gameId)
      if (kind === 'set' || kind === 'group') {
        errors.push(
          `${id}: シリーズ／グループスキル sk:${gameId} を持っています（setBonusIds は常に空の前提）`,
        )
      }
    }
    if (weapon.specials.length > 1) {
      errors.push(`${id}: specials が ${weapon.specials.length} 個あります（0または1個の前提）`)
    }
    if (weapon.specials.some((special) => special.hidden)) {
      errors.push(`${id}: hidden が true の specials があります`)
    }
    const special = weapon.specials[0]
    const result: MasterWeapon = {
      id,
      weaponType: weapon.kind,
      attack: weapon.attack_raw,
      affinity: weapon.affinity,
      slots: toSlots(weapon.slots, 'weapon'),
      skills: toSkillLevels(weapon.skills),
      setBonusIds: [],
    }
    if (special) {
      result.element = {
        type: (special.kind === 'element' ? special.element : special.status) ?? '',
        value: special.raw,
      }
    }
    return result
  })
}

function buildDecorations(input: MhdbInput): MasterDecoration[] {
  return input.accessories.map((accessory) => ({
    id: decorationId(accessory.game_id),
    target: accessory.allowed_on as SlotTarget,
    slotLevel: accessory.level as SlotLevel,
    skills: toSkillLevels(accessory.skills),
  }))
}

function buildCharms(input: MhdbInput): MasterCharm[] {
  return input.amulets
    .filter((amulet) => !amulet.is_random)
    .flatMap((amulet) =>
      amulet.ranks.map((rank) => ({
        id: charmId(amulet.game_id, rank.level),
        rarity: rank.rarity,
        skills: toSkillLevels(rank.skills),
        slots: [],
      })),
    )
}

function entry(
  names: MhdbNames,
  descriptions: MhdbNames | undefined,
  locale: string,
): DictionaryEntry {
  const result: DictionaryEntry = { name: names[locale] ?? '' }
  const description = descriptions?.[locale]
  if (description !== undefined) result.description = description
  return result
}

function buildDictionary(
  input: MhdbInput,
  version: MasterVersion,
  locale: 'ja' | 'en',
): MasterDictionary {
  const entries: Record<string, DictionaryEntry> = {}
  for (const skill of input.skills) {
    const levelDescriptions = [...skill.ranks]
      .sort((a, b) => a.level - b.level)
      .map((rank) => rank.descriptions?.[locale] ?? '')
    entries[skillId(skill.game_id)] = {
      ...entry(skill.names, skill.descriptions, locale),
      levelDescriptions,
    }
    if (skill.kind === 'set' || skill.kind === 'group') {
      entries[setBonusId(skill.game_id)] = { name: skill.names[locale] ?? '' }
    }
  }
  for (const armorSet of input.armors) {
    for (const piece of armorSet.pieces) {
      entries[armorId(armorSet.game_id, piece.kind as ArmorPart)] = entry(
        piece.names,
        piece.descriptions,
        locale,
      )
    }
  }
  for (const accessory of input.accessories) {
    entries[decorationId(accessory.game_id)] = entry(
      accessory.names,
      accessory.descriptions,
      locale,
    )
  }
  for (const weapon of input.weapons) {
    entries[weaponId(weapon.kind, weapon.game_id)] = entry(
      weapon.names,
      weapon.descriptions,
      locale,
    )
  }
  for (const amulet of input.amulets.filter((item) => !item.is_random)) {
    for (const rank of amulet.ranks) {
      entries[charmId(amulet.game_id, rank.level)] = entry(rank.names, rank.descriptions, locale)
    }
  }
  return { version, locale, entries }
}

function buildSkills(input: MhdbInput, errors: string[]): MasterSkill[] {
  return input.skills.map((skill) => {
    const id = skillId(skill.game_id)
    if (skill.ranks.length === 0) {
      errors.push(`${id}: ranks が空です`)
    }
    return {
      id,
      kind: SKILL_KINDS[skill.kind] ?? 'armor',
      maxLevel: Math.max(0, ...skill.ranks.map((rank) => rank.level)),
      effectsByLevel: [],
    }
  })
}

/** MHDB の入力を `MasterBundle` と ja・en の辞書に変換する。型の前提を外れた入力は、ID を示して失敗させる */
export function convert(input: MhdbInput, config: ConvertConfig): ConvertResult {
  const errors: string[] = []
  const version = config.version as MasterVersion
  const skillKinds = new Map(input.skills.map((skill) => [String(skill.game_id), skill.kind]))
  for (const skill of input.skills) {
    if (!(skill.kind in SKILL_KINDS)) {
      errors.push(`${skillId(skill.game_id)}: 未知の kind ${skill.kind}`)
    }
  }
  const { setBonuses, mismatches } = buildSetBonuses(input.skills, input.armors)
  const bundle: MasterBundle = {
    version,
    source: { repository: config.repository, commit: config.commit },
    skills: buildSkills(input, errors),
    setBonuses,
    armors: buildArmors(input.armors, skillKinds, errors),
    decorations: buildDecorations(input),
    weapons: buildWeapons(input, skillKinds, errors),
    charms: buildCharms(input),
    appraisedCharm: { patterns: [], groups: [] },
  }
  if (errors.length > 0) {
    throw new Error(formatList('MHDB の形が型の前提を外れています', errors))
  }
  return {
    bundle,
    dictionaries: {
      ja: buildDictionary(input, version, 'ja'),
      en: buildDictionary(input, version, 'en'),
    },
    mismatches,
  }
}

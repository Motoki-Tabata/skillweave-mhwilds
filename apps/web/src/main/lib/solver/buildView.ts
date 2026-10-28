import type {
  ArmorId,
  ArmorPart,
  ConditionId,
  DecorationId,
  MasterArmor,
  MasterSkill,
  MasterWeapon,
  SkillId,
  SkillKind,
  SlotLevel,
} from '@swv/data'
import type { DamageBase, SlotRef, SolvedBuild, SolverCharm, Uuid } from '@swv/solver'
import type { Build, BuildPayload, BuildWeapon } from '@/lib/api/builds'
import { SLOT_TARGET_LABELS } from '@/constants/charms'
import { ARMOR_PARTS, SKILL_KINDS, SLOT_OWNER_LABELS } from '@/constants/labels'

/** 構成を表示用の行に直すために、マスターと辞書を引く関数。 */
export interface BuildLookup {
  /** 護石を ID で引く。送信した時点の候補から引き、検索の後の編集・削除に影響されない */
  charm: (id: string) => SolverCharm | undefined
  armor: (id: string) => MasterArmor | undefined
  /** 武器のスロット。送信した時点の武器のものを渡す（マスターの武器でも個体差のある武器でも同じ） */
  weaponSlots: readonly { level: number }[] | undefined
  skillKind: (skillId: string) => SkillKind | undefined
  nameOf: (id: string) => string
  /** 装飾品がマスターにあるか。省略すると、すべてあるものとして扱う */
  hasDecoration?: (id: string) => boolean
}

export const NO_ARMOR_LABEL = '防具なし'
/** 現在のマスターに無いスキルを並べる行の見出し */
export const UNKNOWN_SKILL_GROUP_LABEL = '不明'

/** 現在のマスターに無い ID の表示名。ID は保存した文字列のまま出す。 */
export const unknownArmorName = (id: string): string => `不明な防具（${id}）`
export const unknownDecorationName = (id: string): string => `不明な装飾品（${id}）`
export const unknownSkillName = (id: string): string => `不明なスキル（${id}）`
export const unknownWeaponName = (id: string): string => `不明な武器（${id}）`
export const unknownConditionName = (id: string): string => `不明な発動条件（${id}）`

export interface ArmorRow {
  part: ArmorPart
  partLabel: string
  /** 防具が無い部位は「防具なし」。現在のマスターに無い防具は「不明な防具（<ID>）」 */
  name: string
  /** マスターに無い防具・防具なしは 0（合計に数えない） */
  defense: number
  /** 防具を着けていて、現在のマスターに無いとき false（防御力の列は「−」にする） */
  known: boolean
}

export interface DecorationRow {
  ownerLabel: string
  slotLevel: number | null
  name: string
}

export interface SkillChip {
  name: string
  level: number
}

export interface SkillGroupView {
  /** `unknown` は現在のマスターに無いスキルの行 */
  kind: SkillKind | 'unknown'
  label: string
  chips: SkillChip[]
}

export interface FreeSlotChip {
  ownerLabel: string
  slotLevel: number | null
}

export interface BuildView {
  armors: ArmorRow[]
  defenseTotal: number
  decorations: DecorationRow[]
  skillGroups: SkillGroupView[]
  freeSlots: FreeSlotChip[]
  /** 構成が護石を使っていないとき（または候補に無いとき）は null */
  charm: CharmView | null
}

export interface CharmSlotView {
  targetLabel: string
  level: number
}

export interface CharmView {
  rarity: number
  skills: SkillChip[]
  slots: CharmSlotView[]
}

/** スキルのチップ。マスターに無いスキルは「不明なスキル（<ID>）」。 */
function skillChip(skillId: string, level: number, lookup: BuildLookup): SkillChip {
  const known = lookup.skillKind(skillId) !== undefined
  return { name: known ? lookup.nameOf(skillId) : unknownSkillName(skillId), level }
}

function charmView(build: SolvedBuild, lookup: BuildLookup): CharmView | null {
  if (build.charmId === null) return null
  const charm = lookup.charm(build.charmId)
  if (charm === undefined) return null
  return {
    rarity: charm.rarity,
    skills: charm.skills.map((skill) => skillChip(skill.skillId, skill.level, lookup)),
    slots: charm.slots.map((slot) => ({
      targetLabel: SLOT_TARGET_LABELS[slot.target],
      level: slot.level,
    })),
  }
}

/** スロットの Lv。持ち主の護石・防具・武器がマスターに無いときは null。 */
function slotLevelOf(build: SolvedBuild, ref: SlotRef, lookup: BuildLookup): number | null {
  if (ref.owner === 'charm') {
    if (build.charmId === null) return null
    return lookup.charm(build.charmId)?.slots[ref.index]?.level ?? null
  }
  if (ref.owner === 'weapon') return lookup.weaponSlots?.[ref.index]?.level ?? null
  const armorId = build.armor[ref.owner]
  if (armorId === null) return null
  return lookup.armor(armorId)?.slots[ref.index]?.level ?? null
}

function armorRows(build: SolvedBuild, lookup: BuildLookup): ArmorRow[] {
  return ARMOR_PARTS.map(({ id, label }) => {
    const armorId = build.armor[id]
    if (armorId === null) {
      return { part: id, partLabel: label, name: NO_ARMOR_LABEL, defense: 0, known: true }
    }
    const armor = lookup.armor(armorId)
    if (armor === undefined) {
      return {
        part: id,
        partLabel: label,
        name: unknownArmorName(armorId),
        defense: 0,
        known: false,
      }
    }
    return {
      part: id,
      partLabel: label,
      name: lookup.nameOf(armorId),
      defense: armor.defense,
      known: true,
    }
  })
}

function decorationName(id: string, lookup: BuildLookup): string {
  return lookup.hasDecoration?.(id) === false ? unknownDecorationName(id) : lookup.nameOf(id)
}

function skillGroups(build: SolvedBuild, lookup: BuildLookup): SkillGroupView[] {
  const groups: SkillGroupView[] = SKILL_KINDS.map(({ id, label }) => ({
    kind: id,
    label,
    chips: build.skills
      .filter((skill) => lookup.skillKind(skill.skillId) === id)
      .map((skill) => skillChip(skill.skillId, skill.level, lookup)),
  }))
  // 種類が分からないスキルは、最後の「不明」の行に並べる
  groups.push({
    kind: 'unknown',
    label: UNKNOWN_SKILL_GROUP_LABEL,
    chips: build.skills
      .filter((skill) => lookup.skillKind(skill.skillId) === undefined)
      .map((skill) => skillChip(skill.skillId, skill.level, lookup)),
  })
  return groups.filter((group) => group.chips.length > 0)
}

/** 構成（ソルバーの `SolvedBuild`）を、画面に出す行にする。 */
export function toBuildView(build: SolvedBuild, lookup: BuildLookup): BuildView {
  const armors = armorRows(build, lookup)
  return {
    armors,
    defenseTotal: armors.reduce((sum, row) => sum + row.defense, 0),
    decorations: build.decorations.map(({ slot, decorationId }) => ({
      ownerLabel: SLOT_OWNER_LABELS[slot.owner],
      slotLevel: slotLevelOf(build, slot, lookup),
      name: decorationName(decorationId, lookup),
    })),
    skillGroups: skillGroups(build, lookup),
    charm: charmView(build, lookup),
    freeSlots: build.freeSlots.map((slot) => ({
      ownerLabel: SLOT_OWNER_LABELS[slot.owner],
      slotLevel: slotLevelOf(build, slot, lookup),
    })),
  }
}

/** 保存した構成を表示するために引く、現在のマスター。 */
export interface SavedBuildMaster {
  /** 現在のマスターの版 */
  version: string
  nameOf: (id: string) => string
  armorById: ReadonlyMap<string, MasterArmor>
  hasDecoration: (id: string) => boolean
  skillById: ReadonlyMap<string, MasterSkill>
  weaponById: ReadonlyMap<string, MasterWeapon>
  hasCondition: (id: string) => boolean
}

export interface SavedCondition {
  id: string
  name: string
  known: boolean
}

/** 保存した構成を、構成のカードに出す材料にしたもの。 */
export interface SavedBuildView {
  solved: SolvedBuild
  /** 護石の写し。ID で引く（`BuildLookup.charm` に使う） */
  charms: ReadonlyMap<string, SolverCharm>
  lookup: BuildLookup
  weaponName: string
  /** 火力の基。マスターの武器が現在のマスターに無いときは null（火力を計算できない） */
  damageBase: DamageBase | null
  /** 保存したときにオンだった発動条件（マスターに無いものは「不明な発動条件（<ID>）」） */
  conditions: SavedCondition[]
  /** 火力の計算に渡すスキル。現在のマスターに無いスキルを除く */
  damageSkills: SolvedBuild['skills']
  /** 火力の計算に渡す発動条件。現在のマスターに無いものを除く */
  damageConditionIds: ConditionId[]
  /** 保存したときのマスターの版 */
  masterVersion: string
  /** 現在のマスターの版 */
  currentMasterVersion: string
  /** 版が違うとき true（警告を出す。移行・再計算はしない） */
  versionDiffers: boolean
}

interface SavedWeaponView {
  name: string
  slots: readonly { level: number }[] | undefined
  damageBase: DamageBase | null
}

function savedWeaponView(weapon: BuildWeapon, master: SavedBuildMaster): SavedWeaponView {
  if (weapon.kind === 'master') {
    const found = master.weaponById.get(weapon.weaponId)
    if (found === undefined) {
      return { name: unknownWeaponName(weapon.weaponId), slots: undefined, damageBase: null }
    }
    return {
      name: master.nameOf(found.id),
      slots: found.slots,
      damageBase: { attack: found.attack, affinity: found.affinity },
    }
  }
  const { payload } = weapon
  const base = master.weaponById.get(payload.baseWeaponId)
  const baseName =
    base === undefined ? unknownWeaponName(payload.baseWeaponId) : master.nameOf(base.id)
  return {
    name: `${payload.name === '' ? baseName : payload.name}（個体差）`,
    slots: payload.slots.map((slot) => ({ level: slot.level })),
    damageBase: { attack: payload.attack, affinity: payload.affinity },
  }
}

function solvedOf(payload: BuildPayload): SolvedBuild {
  const { armor, charm } = payload
  return {
    armor: {
      head: armor.head as ArmorId | null,
      chest: armor.chest as ArmorId | null,
      arms: armor.arms as ArmorId | null,
      waist: armor.waist as ArmorId | null,
      legs: armor.legs as ArmorId | null,
    },
    charmId: (charm?.id ?? null) as Uuid | null,
    decorations: payload.decorations.map(({ slot, decorationId }) => ({
      slot: { owner: slot.owner, index: slot.index },
      decorationId: decorationId as DecorationId,
    })),
    skills: payload.skills.map(({ skillId, level, rawLevel }) => ({
      skillId: skillId as SkillId,
      level,
      rawLevel,
    })),
    freeSlots: payload.freeSlots.map((slot) => ({ owner: slot.owner, index: slot.index })),
  }
}

function charmMap(payload: BuildPayload): Map<string, SolverCharm> {
  const { charm } = payload
  if (charm === null) return new Map()
  const copy: SolverCharm = {
    id: charm.id as Uuid,
    rarity: charm.payload.rarity,
    skills: charm.payload.skills.map((skill) => ({
      skillId: skill.skillId as SkillId,
      level: skill.level,
    })),
    slots: charm.payload.slots.map((slot) => ({
      target: slot.target,
      level: slot.level as SlotLevel,
    })),
  }
  return new Map([[copy.id, copy]])
}

/**
 * 保存した構成から、`SolvedBuild` と表示の材料を作る。発動スキル・空きスロットは保存した値、
 * 護石と個体差のある武器は写し、名前と防具・マスターの武器の値は現在のマスターから引く。
 */
export function savedBuildView(build: Build, master: SavedBuildMaster): SavedBuildView {
  const { payload } = build
  const solved = solvedOf(payload)
  const charms = charmMap(payload)
  const weapon = savedWeaponView(payload.weapon, master)
  const lookup: BuildLookup = {
    charm: (id) => charms.get(id),
    armor: (id) => master.armorById.get(id),
    weaponSlots: weapon.slots,
    skillKind: (skillId) => master.skillById.get(skillId)?.kind,
    nameOf: master.nameOf,
    hasDecoration: master.hasDecoration,
  }
  return {
    solved,
    charms,
    lookup,
    weaponName: weapon.name,
    damageBase: weapon.damageBase,
    conditions: payload.activeConditionIds.map((id) => {
      const known = master.hasCondition(id)
      return { id, name: known ? master.nameOf(id) : unknownConditionName(id), known }
    }),
    damageSkills: solved.skills.filter((skill) => master.skillById.has(skill.skillId)),
    damageConditionIds: payload.activeConditionIds.filter(master.hasCondition) as ConditionId[],
    masterVersion: build.masterVersion,
    currentMasterVersion: master.version,
    versionDiffers: build.masterVersion !== master.version,
  }
}

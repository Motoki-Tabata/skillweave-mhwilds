import type { ArmorPart, MasterArmor, MasterWeapon, SkillKind } from '@swv/data'
import type { SlotRef, SolvedBuild } from '@swv/solver'
import { ARMOR_PARTS, SKILL_KINDS, SLOT_OWNER_LABELS } from '@/constants/labels'

/** 構成を表示用の行に直すために、マスターと辞書を引く関数。 */
export interface BuildLookup {
  armor: (id: string) => MasterArmor | undefined
  weapon: MasterWeapon | undefined
  skillKind: (skillId: string) => SkillKind | undefined
  nameOf: (id: string) => string
}

export const NO_ARMOR_LABEL = '防具なし'

export interface ArmorRow {
  part: ArmorPart
  partLabel: string
  /** 防具が無い部位は「防具なし」 */
  name: string
  defense: number
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
  kind: SkillKind
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
}

/** スロットの Lv。持ち主の防具・武器がマスターに無いときは null。 */
function slotLevelOf(build: SolvedBuild, ref: SlotRef, lookup: BuildLookup): number | null {
  if (ref.owner === 'charm') return null
  if (ref.owner === 'weapon') return lookup.weapon?.slots[ref.index]?.level ?? null
  const armorId = build.armor[ref.owner]
  if (armorId === null) return null
  return lookup.armor(armorId)?.slots[ref.index]?.level ?? null
}

function armorRows(build: SolvedBuild, lookup: BuildLookup): ArmorRow[] {
  return ARMOR_PARTS.map(({ id, label }) => {
    const armorId = build.armor[id]
    return {
      part: id,
      partLabel: label,
      name: armorId === null ? NO_ARMOR_LABEL : lookup.nameOf(armorId),
      defense: armorId === null ? 0 : (lookup.armor(armorId)?.defense ?? 0),
    }
  })
}

function skillGroups(build: SolvedBuild, lookup: BuildLookup): SkillGroupView[] {
  return SKILL_KINDS.map(({ id, label }) => ({
    kind: id,
    label,
    chips: build.skills
      .filter((skill) => lookup.skillKind(skill.skillId) === id)
      .map((skill) => ({ name: lookup.nameOf(skill.skillId), level: skill.level })),
  })).filter((group) => group.chips.length > 0)
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
      name: lookup.nameOf(decorationId),
    })),
    skillGroups: skillGroups(build, lookup),
    freeSlots: build.freeSlots.map((slot) => ({
      ownerLabel: SLOT_OWNER_LABELS[slot.owner],
      slotLevel: slotLevelOf(build, slot, lookup),
    })),
  }
}

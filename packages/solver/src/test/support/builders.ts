import type {
  ArmorId,
  ArmorPart,
  DecorationId,
  SearchInput,
  SkillId,
  SkillLevel,
  Slot,
  SlotLevel,
  SlotTarget,
  SolverArmor,
  SolverCharm,
  SolverDecoration,
  Uuid,
} from '../../main/types'
import { PARTS } from './syntheticData'

/** 手作りデータ用の短い構築ヘルパ */
export const skill = (id: string, level = 1): SkillLevel => ({ skillId: id as SkillId, level })

export const slot = (level: SlotLevel, target: SlotTarget = 'armor'): Slot => ({ target, level })

export function armor(
  id: string,
  part: ArmorPart,
  opts: { skills?: SkillLevel[]; slots?: Slot[]; defense?: number } = {},
): SolverArmor {
  return {
    id: id as ArmorId,
    part,
    slots: opts.slots ?? [],
    skills: opts.skills ?? [],
    defense: opts.defense ?? 10,
  }
}

export function charm(
  id: string,
  opts: { skills?: SkillLevel[]; slots?: Slot[] } = {},
): SolverCharm {
  return { id: id as Uuid, slots: opts.slots ?? [], skills: opts.skills ?? [] }
}

export function decoration(
  id: string,
  target: SlotTarget,
  level: SlotLevel,
  skills: SkillLevel[],
): SolverDecoration {
  return { id: id as DecorationId, target, slotLevel: level, skills }
}

/** 5部位に1つずつ（id は `<part>1`）の防具。部位ごとの上書きは overrides */
export function baseArmors(overrides: Partial<Record<ArmorPart, SolverArmor[]>> = {}) {
  return PARTS.flatMap((p) => overrides[p] ?? [armor(`${p}1`, p)])
}

export function input(partial: Partial<SearchInput>): SearchInput {
  return {
    required: [],
    armors: baseArmors(),
    charms: [],
    weapon: { slots: [], skills: [] },
    decorations: [],
    ...partial,
  }
}

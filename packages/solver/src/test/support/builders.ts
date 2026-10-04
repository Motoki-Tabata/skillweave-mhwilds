import type {
  ArmorId,
  ArmorPart,
  DecorationId,
  MasterArmor,
  MasterBundle,
  MasterDecoration,
  MasterSkill,
  MasterVersion,
  MasterWeapon,
  SetBonus,
  SetBonusId,
  SkillId,
  SkillKind,
  SkillLevel,
  Slot,
  SlotLevel,
  SlotTarget,
  WeaponId,
} from '@swv/data'
import type { SolverCharm, SolverRequest, Uuid } from '../../main/request'

export const PARTS: readonly ArmorPart[] = ['head', 'chest', 'arms', 'waist', 'legs']

/** 手作りのマスター用の短い構築ヘルパ（ID は文字列をそのまま型に当てる） */
export const skill = (id: string, level = 1): SkillLevel => ({ skillId: id as SkillId, level })
export const slot = (level: SlotLevel, target: SlotTarget = 'armor'): Slot => ({ target, level })
export const armorId = (id: string) => id as ArmorId
export const weaponId = (id: string) => id as WeaponId
export const decorationId = (id: string) => id as DecorationId
export const setBonusId = (id: string) => id as SetBonusId
export const uuid = (id: string) => id as Uuid

export function masterSkill(id: string, kind: SkillKind = 'armor', maxLevel = 3): MasterSkill {
  return { id: id as SkillId, kind, maxLevel, effectsByLevel: [] }
}

/** シリーズ／グループスキルの段。SetBonus の id は `sb:<スキル ID>` */
export function setBonus(skillId: string, thresholds: SetBonus['thresholds']): SetBonus {
  return { id: setBonusId(`sb:${skillId}`), skillId: skillId as SkillId, thresholds }
}

export function armor(
  id: string,
  part: ArmorPart,
  opts: { skills?: SkillLevel[]; slots?: Slot[]; defense?: number; setBonusIds?: string[] } = {},
): MasterArmor {
  return {
    id: armorId(id),
    part,
    rarity: 8,
    slots: opts.slots ?? [],
    skills: opts.skills ?? [],
    setBonusIds: (opts.setBonusIds ?? []).map(setBonusId),
    defense: opts.defense ?? 10,
  }
}

export function decoration(
  id: string,
  target: SlotTarget,
  level: SlotLevel,
  skills: SkillLevel[],
): MasterDecoration {
  return { id: decorationId(id), target, slotLevel: level, skills }
}

export function weapon(
  id: string,
  opts: { slots?: Slot[]; skills?: SkillLevel[]; setBonusIds?: string[] } = {},
): MasterWeapon {
  return {
    id: weaponId(id),
    weaponType: 'bow',
    attack: 100,
    affinity: 0,
    slots: opts.slots ?? [],
    skills: opts.skills ?? [],
    setBonusIds: (opts.setBonusIds ?? []).map(setBonusId),
  }
}

export function charm(
  id: string,
  opts: { skills?: SkillLevel[]; slots?: Slot[] } = {},
): SolverCharm {
  return { id: uuid(id), rarity: 8, slots: opts.slots ?? [], skills: opts.skills ?? [] }
}

/** 5部位に1つずつ（id は `<part>0`・防御力 10・スロットもスキルも無し）の防具。部位ごとの上書きは overrides */
export function plainArmors(
  overrides: Partial<Record<ArmorPart, MasterArmor[]>> = {},
): MasterArmor[] {
  return PARTS.flatMap((p) => overrides[p] ?? [armor(`${p}0`, p)])
}

export const TEST_VERSION = 'test.1' as MasterVersion
export const BASE_WEAPON_ID = 'w0'

export interface MasterParts {
  skills?: MasterSkill[]
  setBonuses?: SetBonus[]
  armors?: MasterArmor[]
  decorations?: MasterDecoration[]
  weapons?: MasterWeapon[]
}

/** 手作りの MasterBundle。武器は既定で何も持たない `w0` を1本入れる */
export function buildMaster(parts: MasterParts = {}): MasterBundle {
  return {
    version: TEST_VERSION,
    source: { repository: 'test/test', commit: '0'.repeat(40) },
    skills: parts.skills ?? [],
    setBonuses: parts.setBonuses ?? [],
    armors: parts.armors ?? plainArmors(),
    decorations: parts.decorations ?? [],
    weapons: parts.weapons ?? [weapon(BASE_WEAPON_ID)],
    charms: [],
    appraisedCharm: { patterns: [], groups: [] },
  }
}

/** 要求の既定: 先頭の武器・護石なし・必須なし・feasible・30 件・10 秒。上書きは overrides */
export function makeRequest(
  master: MasterBundle,
  overrides: Partial<SolverRequest> = {},
): SolverRequest {
  const firstWeapon = master.weapons[0]
  if (firstWeapon === undefined) throw new Error('テストのマスターに武器が無い')
  return {
    masterVersion: master.version,
    weapon: { kind: 'master', weaponId: firstWeapon.id },
    charms: [],
    required: [],
    objective: { kind: 'feasible' },
    maxResults: 30,
    timeoutMs: 10_000,
    ...overrides,
  }
}

import type { ArmorPart, MasterBundle, SetBonusId, SkillLevel, Slot } from '@swv/data'
import { InvalidRequestError } from './errors'
import type { SolverRequest } from './request'

export const PARTS: readonly ArmorPart[] = ['head', 'chest', 'arms', 'waist', 'legs']
export const MAX_RESULTS_LIMIT = 30

/** 武器の形（マスターの武器も個体差のある武器も同じ形にそろえる） */
export interface ResolvedWeapon {
  slots: Slot[]
  skills: SkillLevel[]
  setBonusIds: SetBonusId[]
}

function fail(message: string): never {
  throw new InvalidRequestError(message)
}

function checkSkills(master: MasterBundle, label: string, skills: readonly SkillLevel[]) {
  for (const s of skills) {
    if (!master.skills.some((m) => m.id === s.skillId)) {
      fail(`${label}のスキル ${s.skillId} がマスターに無い`)
    }
  }
}

function resolveWeapon(master: MasterBundle, request: SolverRequest): ResolvedWeapon {
  const { weapon } = request
  if (weapon.kind === 'master') {
    const found = master.weapons.find((w) => w.id === weapon.weaponId)
    if (found === undefined) fail(`武器 ${weapon.weaponId} がマスターに無い`)
    return { slots: found.slots, skills: found.skills, setBonusIds: found.setBonusIds }
  }
  if (!master.weapons.some((w) => w.id === weapon.baseWeaponId)) {
    fail(`個体差のある武器の基の武器 ${weapon.baseWeaponId} がマスターに無い`)
  }
  checkSkills(master, '個体差のある武器', weapon.skills)
  for (const id of weapon.setBonusIds) {
    if (!master.setBonuses.some((b) => b.id === id)) {
      fail(`個体差のある武器のシリーズ／グループスキル ${id} がマスターに無い`)
    }
  }
  return { slots: weapon.slots, skills: weapon.skills, setBonusIds: weapon.setBonusIds }
}

function checkRequired(master: MasterBundle, request: SolverRequest) {
  for (const r of request.required) {
    const skill = master.skills.find((m) => m.id === r.skillId)
    if (skill === undefined) fail(`必須スキル ${r.skillId} がマスターに無い`)
    if (!Number.isInteger(r.level) || r.level < 1) {
      fail(`必須スキル ${r.skillId} の下限 ${r.level} は 1 以上の整数でなければならない`)
    }
    if (r.level > skill.maxLevel) {
      fail(`必須スキル ${r.skillId} の下限 ${r.level} が最大レベル ${skill.maxLevel} を超える`)
    }
  }
}

function checkArmor(master: MasterBundle, request: SolverRequest) {
  const fixed = request.fixedArmor ?? {}
  const excluded = request.excludedArmorIds ?? []
  for (const id of excluded) {
    if (!master.armors.some((a) => a.id === id)) fail(`除外の防具 ${id} がマスターに無い`)
  }
  for (const part of PARTS) {
    const id = fixed[part]
    if (id === undefined || id === null) continue
    const armor = master.armors.find((a) => a.id === id)
    if (armor === undefined) fail(`固定の防具 ${id} がマスターに無い`)
    if (armor.part !== part) {
      fail(`部位 ${part} に別の部位 ${armor.part} の防具 ${id} を固定できない`)
    }
    if (excluded.includes(id)) fail(`防具 ${id} が固定と除外の両方に指定されている`)
  }
}

/** 求解の前に要求を検証する。不正なら InvalidRequestError を投げ、正しければ武器の形を返す */
export function validateRequest(master: MasterBundle, request: SolverRequest): ResolvedWeapon {
  if (request.masterVersion !== master.version) {
    fail(
      `masterVersion ${request.masterVersion} が読み込んだマスターの版 ${master.version} と一致しない`,
    )
  }
  const weapon = resolveWeapon(master, request)
  for (const c of request.charms) checkSkills(master, '護石', c.skills)
  checkRequired(master, request)
  checkArmor(master, request)
  const { maxResults, timeoutMs, objective } = request
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS_LIMIT) {
    fail(`maxResults ${maxResults} は 1〜${MAX_RESULTS_LIMIT} の整数でなければならない`)
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    fail(`timeoutMs ${timeoutMs} は 0 より大きい有限の数でなければならない`)
  }
  if (objective.kind === 'maximize' && objective.metric === 'expectedDamage') {
    fail('目的関数 expectedDamage は未対応')
  }
  return weapon
}

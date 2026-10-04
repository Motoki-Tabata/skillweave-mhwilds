import type { ArmorPart, MasterArmor, MasterBundle, SetBonusId, SkillId, Slot } from '@swv/data'
import type { SlotOwner, SolvedBuild, SolverRequest } from '../../main/request'
import { PARTS } from './builders'

interface Equipped {
  weapon: {
    slots: Slot[]
    skills: { skillId: SkillId; level: number }[]
    setBonusIds: SetBonusId[]
  }
  armors: Partial<Record<ArmorPart, MasterArmor>>
  charm: { slots: Slot[]; skills: { skillId: SkillId; level: number }[] } | null
  /** 持ち主ごとのスロット */
  slotsOf: Record<string, Slot[]>
}

function resolveWeapon(master: MasterBundle, request: SolverRequest): Equipped['weapon'] {
  const w = request.weapon
  if (w.kind === 'custom') return w
  const found = master.weapons.find((m) => m.id === w.weaponId)
  if (found === undefined) throw new Error(`武器 ${w.weaponId} がマスターに無い`)
  return found
}

const byText = (a: string, b: string) => a.localeCompare(b)
const slotKey = (owner: SlotOwner, index: number) => `${owner}#${index}`

/** 部位ごとの防具の選び方が、固定・除外に合っているか */
function checkArmors(
  master: MasterBundle,
  request: SolverRequest,
  build: SolvedBuild,
  equipped: Equipped,
  problems: string[],
) {
  const fixed = request.fixedArmor ?? {}
  const excluded = new Set<string>(request.excludedArmorIds ?? [])
  for (const part of PARTS) {
    const id = build.armor[part]
    const fixedId = fixed[part]
    if (id === null) {
      if (fixedId !== null) problems.push(`部位 ${part} が空だが null 固定ではない`)
      equipped.slotsOf[part] = []
      continue
    }
    const found = master.armors.find((a) => a.id === id)
    if (found?.part === part) equipped.armors[part] = found
    else problems.push(`部位 ${part} の防具 ${id} がマスターに無いか部位が違う`)
    if (fixedId !== undefined && fixedId !== id) problems.push(`部位 ${part} は ${fixedId} に固定`)
    if (excluded.has(id)) problems.push(`除外された防具 ${id} を選んでいる`)
    equipped.slotsOf[part] = found?.slots ?? []
  }
}

/** 防具・護石の選び方が要求（固定・除外・候補）に合っているか。合っていれば装備を返す */
function checkEquipment(
  master: MasterBundle,
  request: SolverRequest,
  build: SolvedBuild,
  problems: string[],
): Equipped {
  const weapon = resolveWeapon(master, request)
  const equipped: Equipped = { weapon, armors: {}, charm: null, slotsOf: { weapon: weapon.slots } }
  checkArmors(master, request, build, equipped, problems)

  if (request.charms.length === 0) {
    if (build.charmId !== null) problems.push('護石の候補が空なのに護石を選んでいる')
  } else {
    equipped.charm = request.charms.find((c) => c.id === build.charmId) ?? null
    if (equipped.charm === null) {
      problems.push(`護石 ${build.charmId} が候補に無い（候補があるときは1つ選ぶ）`)
    }
  }
  equipped.slotsOf.charm = equipped.charm?.slots ?? []
  return equipped
}

/** 装飾品の配置: スロットが実在し、同じスロットに2つ付かず、種別と Lv が合うこと。空きスロットの一致も見る */
function checkPlacement(
  master: MasterBundle,
  build: SolvedBuild,
  equipped: Equipped,
  problems: string[],
) {
  const used = new Set<string>()
  for (const { slot: ref, decorationId } of build.decorations) {
    const key = slotKey(ref.owner, ref.index)
    const target = equipped.slotsOf[ref.owner]?.[ref.index]
    const deco = master.decorations.find((d) => d.id === decorationId)
    if (target === undefined) problems.push(`スロット ${key} が存在しない`)
    else if (deco === undefined) problems.push(`装飾品 ${decorationId} がマスターに無い`)
    else {
      if (deco.target !== target.target) {
        problems.push(
          `装飾品 ${decorationId}（${deco.target}）が ${target.target} 用のスロット ${key}`,
        )
      }
      if (deco.slotLevel > target.level) {
        problems.push(`装飾品 ${decorationId}（Lv${deco.slotLevel}）が Lv${target.level} の ${key}`)
      }
    }
    if (used.has(key)) problems.push(`スロット ${key} に装飾品が2つ付いている`)
    used.add(key)
  }

  const expectedFree = Object.entries(equipped.slotsOf).flatMap(([owner, slots]) =>
    slots.flatMap((_, index) =>
      used.has(slotKey(owner as SlotOwner, index)) ? [] : [slotKey(owner as SlotOwner, index)],
    ),
  )
  const actualFree = build.freeSlots.map((r) => slotKey(r.owner, r.index))
  if (expectedFree.toSorted(byText).join(',') !== actualFree.toSorted(byText).join(',')) {
    problems.push(`空きスロット [${actualFree}] が数え直した [${expectedFree}] と違う`)
  }
  return used
}

/** 通常のスキルの合計（rawLevel）。除く装飾品の位置を指定できる */
function ordinaryLevels(
  master: MasterBundle,
  build: SolvedBuild,
  equipped: Equipped,
  skipDecorationAt?: number,
): Map<string, number> {
  const levels = new Map<string, number>()
  const add = (skills: readonly { skillId: SkillId; level: number }[]) => {
    for (const s of skills) levels.set(s.skillId, (levels.get(s.skillId) ?? 0) + s.level)
  }
  add(equipped.weapon.skills)
  for (const armor of Object.values(equipped.armors)) add(armor.skills)
  add(equipped.charm?.skills ?? [])
  build.decorations.forEach((d, i) => {
    if (i === skipDecorationAt) return
    add(master.decorations.find((m) => m.id === d.decorationId)?.skills ?? [])
  })
  return levels
}

/** シリーズ／グループスキルの部位数（武器を1、防具を1部位ずつ数える） */
function pieceCount(equipped: Equipped, setBonusId: SetBonusId): number {
  let pieces = equipped.weapon.setBonusIds.includes(setBonusId) ? 1 : 0
  for (const armor of Object.values(equipped.armors)) {
    if (armor.setBonusIds.includes(setBonusId)) pieces++
  }
  return pieces
}

function setSkillLevel(master: MasterBundle, equipped: Equipped, skillId: SkillId): number {
  const bonus = master.setBonuses.find((b) => b.skillId === skillId)
  if (bonus === undefined) return 0
  const pieces = pieceCount(equipped, bonus.id)
  return Math.max(0, ...bonus.thresholds.filter((t) => pieces >= t.pieces).map((t) => t.level))
}

function isSetSkill(master: MasterBundle, skillId: SkillId): boolean {
  const kind = master.skills.find((s) => s.id === skillId)?.kind
  return kind === 'series' || kind === 'group'
}

/** 必須スキルごとの、数え直したレベル。装飾品を1つ外した場合の確認にも使う */
function levelOf(
  master: MasterBundle,
  build: SolvedBuild,
  equipped: Equipped,
  skillId: SkillId,
  skipDecorationAt?: number,
): number {
  if (isSetSkill(master, skillId)) return setSkillLevel(master, equipped, skillId)
  return ordinaryLevels(master, build, equipped, skipDecorationAt).get(skillId) ?? 0
}

function checkSkills(
  master: MasterBundle,
  request: SolverRequest,
  build: SolvedBuild,
  equipped: Equipped,
  problems: string[],
) {
  const raw = ordinaryLevels(master, build, equipped)
  const expected: SolvedBuild['skills'] = []
  for (const s of master.skills) {
    if (isSetSkill(master, s.id)) {
      const level = setSkillLevel(master, equipped, s.id)
      if (level > 0) expected.push({ skillId: s.id, level, rawLevel: level })
    } else {
      const rawLevel = raw.get(s.id) ?? 0
      if (rawLevel > 0) {
        expected.push({ skillId: s.id, level: Math.min(rawLevel, s.maxLevel), rawLevel })
      }
    }
  }
  if (JSON.stringify(expected) !== JSON.stringify(build.skills)) {
    problems.push(
      `発動スキル ${JSON.stringify(build.skills)} が数え直した ${JSON.stringify(expected)} と違う`,
    )
  }
  for (const req of request.required) {
    const actual = levelOf(master, build, equipped, req.skillId)
    if (actual < req.level) problems.push(`${req.skillId} は ${actual} で下限 ${req.level} 未満`)
  }
  // 外すと必須スキルが下限を割る装飾品だけを付けている（余分な装飾品は空きスロットを減らす）
  build.decorations.forEach((d, i) => {
    const stillOk = request.required.every(
      (req) => levelOf(master, build, equipped, req.skillId, i) >= req.level,
    )
    if (stillOk) problems.push(`装飾品 ${d.decorationId} は外しても必須スキルを満たす（不要）`)
  })
}

function checkObjective(
  request: SolverRequest,
  build: SolvedBuild,
  equipped: Equipped,
  problems: string[],
) {
  const { objective } = request
  if (objective.kind === 'feasible') {
    if (build.score !== undefined) problems.push('feasible なのに score がある')
    return
  }
  const freeLevel = (target: Slot['target']) => {
    const slots = Object.entries(equipped.slotsOf).flatMap(([owner, list]) =>
      list.flatMap((s, index) => (s.target === target ? [{ owner, index, level: s.level }] : [])),
    )
    const free = new Set(build.freeSlots.map((r) => slotKey(r.owner, r.index)))
    return slots
      .filter((s) => free.has(slotKey(s.owner as SlotOwner, s.index)))
      .reduce((n, s) => n + s.level, 0)
  }
  if (objective.metric === 'defense') {
    const defense = Object.values(equipped.armors).reduce((n, a) => n + a.defense, 0)
    if (build.score !== defense)
      problems.push(`score ${build.score} が防御力の合計 ${defense} と違う`)
    if (build.freeSlotLevels !== undefined) problems.push('defense なのに freeSlotLevels がある')
  } else if (objective.metric === 'freeSlots') {
    const levels = { armor: freeLevel('armor'), weapon: freeLevel('weapon') }
    if (JSON.stringify(build.freeSlotLevels) !== JSON.stringify(levels)) {
      problems.push(
        `freeSlotLevels ${JSON.stringify(build.freeSlotLevels)} が数え直した ${JSON.stringify(levels)} と違う`,
      )
    }
    if (build.score !== levels.armor)
      problems.push(`score ${build.score} が防具用の空き Lv ${levels.armor} と違う`)
  }
}

/**
 * ソルバーと独立に構成を検算する（plan 決定事項 15）。違反の説明の配列を返す（空なら合格）。
 * 装備が要求に合うこと・スキルのレベルを数え直して必須の下限と発動スキルに一致すること・
 * 装飾品の配置が種別と Lv を満たし同じスロットに2つ付かないこと・余分な装飾品が無いこと。
 */
export function verifyBuild(
  master: MasterBundle,
  request: SolverRequest,
  build: SolvedBuild,
): string[] {
  const problems: string[] = []
  const equipped = checkEquipment(master, request, build, problems)
  checkPlacement(master, build, equipped, problems)
  checkSkills(master, request, build, equipped, problems)
  checkObjective(request, build, equipped, problems)
  return problems
}

/** 防具と護石の組を表すキー（重複の検査に使う） */
export function armorCharmKey(build: SolvedBuild): string {
  return `${PARTS.map((p) => build.armor[p]).join(',')}|${build.charmId ?? ''}`
}

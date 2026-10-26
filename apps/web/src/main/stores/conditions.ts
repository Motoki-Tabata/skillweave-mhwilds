import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ArmorRank,
  ConditionId,
  MasterSkill,
  MasterWeapon,
  SkillId,
  SkillKind,
  SkillLevel,
  WeaponId,
} from '@swv/data'
import type { SolverWeapon } from '@swv/solver'
import { SKILL_KINDS } from '@/constants/labels'
import type { ObjectiveChoice } from '@/constants/labels'
import { MAX_RESULTS_DEFAULT, MAX_RESULTS_MAX, MAX_RESULTS_MIN } from '@/constants/search'
import { weaponDisplayName, toSolverWeapon } from '@/lib/weapons/convert'
import type { StoredWeapon } from '@/lib/weapons/types'
import { compareJa } from '@/lib/text'
import { useMasterStore } from '@/stores/master'
import { useWeaponsStore } from '@/stores/weapons'

export const NO_WEAPON_REASON = '武器を選ぶと検索できます。'
export const NO_RANK_REASON = '候補にするランクを選ぶと検索できます。'

/** 検索条件で選んでいる武器。マスターの武器か、個体差のある武器（端末に保存した ID）。 */
export type WeaponSelection =
  { kind: 'master'; weaponId: WeaponId } | { kind: 'custom'; id: string }

/** 選択を表示と検索に要る形に解決したもの。 */
export interface ResolvedWeapon {
  kind: 'master' | 'custom'
  /** マスターの武器の ID、または個体差のある武器の ID */
  id: string
  /** 表示名（個体差のある武器は名前、空なら基の武器の名前） */
  name: string
  /** 武器種の ID（個体差のある武器は基の武器の武器種） */
  weaponType: string
  attack: number
  affinity: number
  slots: readonly { level: number }[]
  /** ソルバーに渡す武器 */
  solverWeapon: SolverWeapon
  /** 個体差のある武器のとき、保存した武器 */
  stored?: StoredWeapon
  /** マスターの武器のとき、マスターの武器 */
  master?: MasterWeapon
}

export interface RequiredSkillRow {
  skill: MasterSkill
  level: number
}

export interface RequiredSkillGroup {
  kind: SkillKind
  label: string
  rows: RequiredSkillRow[]
}

function clampCount(value: number): number {
  return Math.min(MAX_RESULTS_MAX, Math.max(MAX_RESULTS_MIN, Math.round(value)))
}

/** 検索条件（武器・必須スキル・目的・件数・候補にするランク）。保存しない（decisions.md Q23）。 */
export const useConditionsStore = defineStore('conditions', () => {
  const master = useMasterStore()
  const weapons = useWeaponsStore()

  const selection = ref<WeaponSelection | null>(null)
  const required = ref<SkillLevel[]>([])
  const objective = ref<ObjectiveChoice>('feasible')
  const maxResults = ref(MAX_RESULTS_DEFAULT)
  // null は「既定」（マスターに含まれる最も高いランクだけ）
  const selectedRanks = ref<ArmorRank[] | null>(null)
  // オンの発動条件の ID（既定は空。保存しない）
  const activeIds = ref<ConditionId[]>([])
  // 武器が未選択のまま送信した・ダイアログを閉じたときに、武器欄のエラーを出す
  const weaponErrorShown = ref(false)

  function resolveMaster(weaponId: WeaponId): ResolvedWeapon | null {
    const found = master.weaponById.get(weaponId)
    if (found === undefined) return null
    return {
      kind: 'master',
      id: found.id,
      name: master.nameOf(found.id),
      weaponType: found.weaponType,
      attack: found.attack,
      affinity: found.affinity,
      slots: found.slots,
      solverWeapon: { kind: 'master', weaponId: found.id },
      master: found,
    }
  }

  function resolveCustom(id: string): ResolvedWeapon | null {
    const bundle = master.bundle
    // 検索の候補（現行のマスターで判定が通るもの）から引く。編集は次の参照から反映される
    const stored = weapons.candidates.find((item) => item.id === id)
    if (bundle === null || stored === undefined) return null
    const base = bundle.weapons.find((item) => item.id === stored.payload.baseWeaponId)
    if (base === undefined) return null
    const { payload } = stored
    return {
      kind: 'custom',
      id,
      name: weaponDisplayName(payload, { bundle, nameOf: master.nameOf }),
      weaponType: base.weaponType,
      attack: payload.attack,
      affinity: payload.affinity,
      slots: payload.slots,
      solverWeapon: toSolverWeapon(stored),
      stored,
    }
  }

  /** 選んでいる武器を、表示と検索に要る形にしたもの。マスターに無い・削除済みなら null。 */
  const weapon = computed<ResolvedWeapon | null>(() => {
    const current = selection.value
    if (current === null) return null
    return current.kind === 'master' ? resolveMaster(current.weaponId) : resolveCustom(current.id)
  })

  const ranks = computed<ArmorRank[]>(() => {
    if (selectedRanks.value !== null) return selectedRanks.value
    const highest = master.availableRanks.at(-1)
    return highest === undefined ? [] : [highest]
  })

  /** マスターの発動条件すべて。ja の名前の順（トグルの並び）。 */
  const conditionOptions = computed(() =>
    (master.bundle?.conditions ?? [])
      .map((condition) => ({ id: condition.id, name: master.nameOf(condition.id) }))
      .sort((a, b) => compareJa(a.name, b.name)),
  )

  /** オンの発動条件の ID。トグルの並びの順。 */
  const activeConditionIds = computed(() =>
    conditionOptions.value.filter((option) => activeIds.value.includes(option.id)).map((o) => o.id),
  )

  const rankError = computed(() => ranks.value.length === 0)

  /** 検索できない理由。複数あてはまるときは上のものを返す。 */
  const unavailableReason = computed<string | null>(() => {
    if (selection.value === null) return NO_WEAPON_REASON
    if (rankError.value) return NO_RANK_REASON
    return null
  })

  /** 必須スキルを種類ごと（武器・防具・シリーズ・グループ）にまとめる。種類の中は追加した順。 */
  const requiredGroups = computed<RequiredSkillGroup[]>(() => {
    const rows: RequiredSkillRow[] = []
    for (const item of required.value) {
      const skill = master.skillById.get(item.skillId)
      if (skill !== undefined) rows.push({ skill, level: item.level })
    }
    return SKILL_KINDS.map((kind) => ({
      kind: kind.id,
      label: kind.label,
      rows: rows.filter((row) => row.skill.kind === kind.id),
    })).filter((group) => group.rows.length > 0)
  })

  function selectWeapon(id: WeaponId): void {
    selection.value = { kind: 'master', weaponId: id }
    weaponErrorShown.value = false
  }

  /** 個体差のある武器を選ぶ。 */
  function selectCustomWeapon(id: string): void {
    selection.value = { kind: 'custom', id }
    weaponErrorShown.value = false
  }

  /** 検索条件でこの ID の個体差のある武器を選んでいるか（削除の確認に使う）。 */
  function isWeaponSelected(id: string): boolean {
    return selection.value?.kind === 'custom' && selection.value.id === id
  }

  /** この ID の個体差のある武器を選んでいれば、選択を外す（武器欄のエラーは出さない）。 */
  function releaseWeapon(id: string): void {
    if (isWeaponSelected(id)) selection.value = null
  }

  function showWeaponError(): void {
    if (selection.value === null) weaponErrorShown.value = true
  }

  function isRequired(skillId: SkillId): boolean {
    return required.value.some((item) => item.skillId === skillId)
  }

  function removeSkill(skillId: SkillId): void {
    required.value = required.value.filter((item) => item.skillId !== skillId)
  }

  /** 追加（下限は最大レベル）。追加済みなら外す。 */
  function toggleSkill(skillId: SkillId): void {
    if (isRequired(skillId)) {
      removeSkill(skillId)
      return
    }
    const skill = master.skillById.get(skillId)
    if (skill !== undefined)
      required.value = [...required.value, { skillId, level: skill.maxLevel }]
  }

  function setSkillLevel(skillId: SkillId, level: number): void {
    const skill = master.skillById.get(skillId)
    if (skill === undefined) return
    const clamped = Math.min(skill.maxLevel, Math.max(1, Math.round(level)))
    required.value = required.value.map((item) =>
      item.skillId === skillId ? { ...item, level: clamped } : item,
    )
  }

  function setObjective(choice: ObjectiveChoice): void {
    objective.value = choice
  }

  function setMaxResults(value: number): void {
    maxResults.value = clampCount(value)
  }

  function setConditionActive(id: ConditionId, active: boolean): void {
    const rest = activeIds.value.filter((item) => item !== id)
    activeIds.value = active ? [...rest, id] : rest
  }

  function setRank(rank: ArmorRank, checked: boolean): void {
    const next = new Set(ranks.value)
    if (checked) next.add(rank)
    else next.delete(rank)
    // マスターに含まれるランクの順（低い順）に並べる
    selectedRanks.value = master.availableRanks.filter((id) => next.has(id))
  }

  return {
    selection,
    required,
    objective,
    maxResults,
    weaponErrorShown,
    weapon,
    ranks,
    rankError,
    unavailableReason,
    requiredGroups,
    conditionOptions,
    activeConditionIds,
    setConditionActive,
    selectWeapon,
    selectCustomWeapon,
    showWeaponError,
    isWeaponSelected,
    releaseWeapon,
    isRequired,
    removeSkill,
    toggleSkill,
    setSkillLevel,
    setObjective,
    setMaxResults,
    setRank,
  }
})

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ArmorRank, MasterSkill, SkillId, SkillKind, SkillLevel, WeaponId } from '@swv/data'
import { SKILL_KINDS } from '@/constants/labels'
import type { ObjectiveChoice } from '@/constants/labels'
import { MAX_RESULTS_DEFAULT, MAX_RESULTS_MAX, MAX_RESULTS_MIN } from '@/constants/search'
import { useMasterStore } from '@/stores/master'

export const NO_WEAPON_REASON = '武器を選ぶと検索できます。'
export const NO_RANK_REASON = '候補にするランクを選ぶと検索できます。'

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

  const weaponId = ref<WeaponId | null>(null)
  const required = ref<SkillLevel[]>([])
  const objective = ref<ObjectiveChoice>('feasible')
  const maxResults = ref(MAX_RESULTS_DEFAULT)
  // null は「既定」（マスターに含まれる最も高いランクだけ）
  const selectedRanks = ref<ArmorRank[] | null>(null)
  // 武器が未選択のまま送信した・ダイアログを閉じたときに、武器欄のエラーを出す
  const weaponErrorShown = ref(false)

  const weapon = computed(() =>
    weaponId.value === null ? null : (master.weaponById.get(weaponId.value) ?? null),
  )

  const ranks = computed<ArmorRank[]>(() => {
    if (selectedRanks.value !== null) return selectedRanks.value
    const highest = master.availableRanks.at(-1)
    return highest === undefined ? [] : [highest]
  })

  const rankError = computed(() => ranks.value.length === 0)

  /** 検索できない理由。複数あてはまるときは上のものを返す。 */
  const unavailableReason = computed<string | null>(() => {
    if (weaponId.value === null) return NO_WEAPON_REASON
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
    weaponId.value = id
    weaponErrorShown.value = false
  }

  function showWeaponError(): void {
    if (weaponId.value === null) weaponErrorShown.value = true
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

  function setRank(rank: ArmorRank, checked: boolean): void {
    const next = new Set(ranks.value)
    if (checked) next.add(rank)
    else next.delete(rank)
    // マスターに含まれるランクの順（低い順）に並べる
    selectedRanks.value = master.availableRanks.filter((id) => next.has(id))
  }

  return {
    weaponId,
    required,
    objective,
    maxResults,
    weaponErrorShown,
    weapon,
    ranks,
    rankError,
    unavailableReason,
    requiredGroups,
    selectWeapon,
    showWeaponError,
    isRequired,
    removeSkill,
    toggleSkill,
    setSkillLevel,
    setObjective,
    setMaxResults,
    setRank,
  }
})

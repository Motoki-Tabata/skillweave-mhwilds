import { computed, ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type { ConditionId } from '@swv/data'
import type { DamageBase, ReverseLookupCandidate, ReverseLookupResponse } from '@swv/solver'
import { buildReverseLookupRequest } from '@/lib/solver/request'
import { useConditionsStore } from '@/stores/conditions'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { useMasterStore } from '@/stores/master'
import { useSearchStore } from '@/stores/search'
import { useToastStore } from '@/stores/toast'

/** 実行していない（キャンセルの後を含む）／実行中／結果／エラー。 */
export type ReverseLookupStatus = 'idle' | 'searching' | 'done' | 'error'

/** 逆引きしたときの条件の要約。実行の後に条件を変えても変わらない。 */
export interface ReverseSummary {
  weaponName: string
  /** 送信した時点の武器のスロット。構成の表示が装飾品の Lv を引く */
  weaponSlots: readonly { level: number }[]
  requiredCount: number
  allRanksSelected: boolean
  /** 逆引きしたときにオンだった発動条件の名前（トグルの並びの順） */
  activeConditionNames: string[]
  fixedPartCount: number
  excludedArmorCount: number
  excludedDecorationCount: number
  /** 抽選テーブルがあって候補にしたレア度（昇順） */
  rarities: number[]
}

/** 火力の計算の元（逆引きの後に変えても変わらない）。 */
export interface ReverseBasis {
  damageBase: DamageBase
  activeConditionIds: ConditionId[]
}

export const REVERSE_CANCELLED_TOAST_MESSAGE = '逆引きをキャンセルしました。'
export const REVERSE_UNAVAILABLE_NO_TABLE = '抽選テーブルが未整備のため、逆引きできません。'

/** 検索できない理由（「…と検索できます。」）を、逆引きの文言に置き換える。 */
function toReverseReason(searchReason: string): string {
  return searchReason.replace('と検索できます。', 'と逆引きできます。')
}

export const useReverseLookupStore = defineStore('reverseLookup', () => {
  const master = useMasterStore()
  const conditions = useConditionsStore()
  const lockExclude = useLockExcludeStore()
  const toast = useToastStore()

  const status = ref<ReverseLookupStatus>('idle')
  const found = ref(0)
  /** 見つけた順の候補（実行中は進捗、終わったら結果の並び） */
  const candidates = shallowRef<readonly ReverseLookupCandidate[]>([])
  const response = ref<ReverseLookupResponse | null>(null)
  const errorMessage = ref('')
  const summary = ref<ReverseSummary | null>(null)
  const submittedBasis = shallowRef<ReverseBasis | null>(null)
  // 実行するたびに増やす（結果パネルの見出しへフォーカスを移す合図）
  const runCount = ref(0)
  // 破棄・取り消し・再実行で増やし、古い実行の応答を無効にする
  let token = 0

  const unavailableReason = computed<string | null>(() => {
    if (conditions.unavailableReason !== null) return toReverseReason(conditions.unavailableReason)
    if (master.appraisedRarities.length === 0) return REVERSE_UNAVAILABLE_NO_TABLE
    return null
  })

  function clearResult(): void {
    found.value = 0
    candidates.value = []
    response.value = null
    errorMessage.value = ''
    summary.value = null
    submittedBasis.value = null
  }

  /** 逆引きを始める。逆引きできない理由があれば始めずに false を返す。 */
  function submit(): boolean {
    const bundle = master.bundle
    const weapon = conditions.weapon
    if (unavailableReason.value !== null || bundle === null || weapon === null) return false
    // 通常の検索の結果・実行中の検索は捨てる（結果パネルには最後に実行したほうだけを出す）
    useSearchStore().discard()
    const submitted = {
      weapon: structuredClone(toRaw(weapon.solverWeapon)),
      required: conditions.required.map((skill) => ({ ...skill })),
      ranks: [...conditions.ranks],
      activeConditionIds: [...conditions.activeConditionIds],
      fixedArmor: { ...lockExclude.fixed },
      excludedArmorIds: [...lockExclude.excludedArmorIds],
      excludedDecorationIds: [...lockExclude.excludedDecorationIds],
    }
    clearResult()
    summary.value = {
      weaponName: weapon.kind === 'custom' ? `${weapon.name}（個体差）` : weapon.name,
      weaponSlots: weapon.slots.map((slot) => ({ level: slot.level })),
      requiredCount: submitted.required.length,
      allRanksSelected: submitted.ranks.length === master.availableRanks.length,
      activeConditionNames: submitted.activeConditionIds.map((id) => master.nameOf(id)),
      fixedPartCount: Object.keys(submitted.fixedArmor).length,
      excludedArmorCount: submitted.excludedArmorIds.length,
      excludedDecorationCount: submitted.excludedDecorationIds.length,
      rarities: [...master.appraisedRarities],
    }
    submittedBasis.value = {
      damageBase: {
        attack: weapon.attack,
        affinity: weapon.affinity,
        weaponType: weapon.weaponType,
      },
      activeConditionIds: submitted.activeConditionIds,
    }
    status.value = 'searching'
    runCount.value += 1
    const mine = ++token
    master.reverseLookup(buildReverseLookupRequest(bundle, submitted), {
      onProgress: (count, candidate) => {
        if (mine !== token) return
        candidates.value = [...candidates.value, candidate]
        found.value = count
      },
      onResult: (result) => {
        if (mine !== token) return
        response.value = result
        candidates.value = result.candidates
        found.value = result.candidates.length
        status.value = 'done'
      },
      onError: (message) => {
        if (mine !== token) return
        errorMessage.value = message
        candidates.value = []
        status.value = 'error'
      },
    })
    return true
  }

  /** 実行中の逆引きを取り消し、実行前の表示に戻す。 */
  function cancel(): void {
    if (status.value !== 'searching') return
    token += 1
    master.cancelSolve()
    clearResult()
    status.value = 'idle'
    toast.push(REVERSE_CANCELLED_TOAST_MESSAGE)
  }

  /** 通知を出さずに結果を消して実行前に戻す（通常の検索を始めるとき）。 */
  function discard(): void {
    token += 1
    clearResult()
    status.value = 'idle'
  }

  return {
    status,
    found,
    candidates,
    response,
    errorMessage,
    summary,
    submittedBasis,
    runCount,
    unavailableReason,
    submit,
    cancel,
    discard,
  }
})

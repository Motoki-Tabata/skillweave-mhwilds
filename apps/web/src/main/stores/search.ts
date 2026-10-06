import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { WeaponId } from '@swv/data'
import type { SolverResponse } from '@swv/solver'
import { objectiveLabel } from '@/constants/labels'
import { buildSolverRequest } from '@/lib/solver/request'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'
import { useToastStore } from '@/stores/toast'

/** Q0 未検索（キャンセルの後を含む）／Q1 検索中／結果（Q2〜Q5）／Q6 エラー。 */
export type SearchStatus = 'idle' | 'searching' | 'done' | 'error'

/** 検索したときの条件の要約。検索の後に条件を変えても変わらない。 */
export interface SearchSummary {
  weaponId: WeaponId
  weaponName: string
  requiredCount: number
  objectiveLabel: string
  maxResults: number
  allRanksSelected: boolean
}

export const CANCELLED_TOAST_MESSAGE = '検索をキャンセルしました。'

export const useSearchStore = defineStore('search', () => {
  const master = useMasterStore()
  const conditions = useConditionsStore()
  const toast = useToastStore()

  const status = ref<SearchStatus>('idle')
  const found = ref(0)
  const response = ref<SolverResponse | null>(null)
  const errorMessage = ref('')
  const summary = ref<SearchSummary | null>(null)
  // 検索を始めるたびに増やす（結果パネルの見出しへフォーカスを移す合図）
  const runCount = ref(0)

  function clearResult(): void {
    found.value = 0
    response.value = null
    errorMessage.value = ''
  }

  function summarize(weaponId: WeaponId): SearchSummary {
    return {
      weaponId,
      weaponName: master.nameOf(weaponId),
      requiredCount: conditions.required.length,
      objectiveLabel: objectiveLabel(conditions.objective),
      maxResults: conditions.maxResults,
      allRanksSelected: conditions.ranks.length === master.availableRanks.length,
    }
  }

  /**
   * 検索を始める。検索できない理由があれば始めずに false を返す
   * （武器の欄のエラーを出す。ランクのエラーは常に出ている）。
   */
  function submit(): boolean {
    const bundle = master.bundle
    const weaponId = conditions.weaponId
    if (conditions.unavailableReason !== null || bundle === null || weaponId === null) {
      conditions.showWeaponError()
      return false
    }
    const request = buildSolverRequest(bundle, {
      weaponId,
      required: conditions.required,
      objective: conditions.objective,
      maxResults: conditions.maxResults,
      ranks: conditions.ranks,
    })
    // 前の検索の結果と進捗はすぐに消す
    clearResult()
    summary.value = summarize(weaponId)
    status.value = 'searching'
    runCount.value += 1
    master.solve(request, {
      onProgress: (count) => {
        found.value = count
      },
      onResult: (result) => {
        response.value = result
        found.value = result.builds.length
        status.value = 'done'
      },
      onError: (message) => {
        errorMessage.value = message
        status.value = 'error'
      },
    })
    return true
  }

  /** 検索中の検索を取り消し、Q0 に戻す。 */
  function cancel(): void {
    if (status.value !== 'searching') return
    master.cancelSolve()
    clearResult()
    status.value = 'idle'
    toast.push(CANCELLED_TOAST_MESSAGE)
  }

  return { status, found, response, errorMessage, summary, runCount, submit, cancel }
})

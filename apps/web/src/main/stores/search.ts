import { ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type { WeaponId } from '@swv/data'
import type { SolverCharm, SolverResponse } from '@swv/solver'
import { objectiveLabel } from '@/constants/labels'
import { buildSolverRequest } from '@/lib/solver/request'
import { useCharmsStore } from '@/stores/charms'
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
  /** 送信した時点の護石の候補の件数 */
  charmCount: number
}

export const CANCELLED_TOAST_MESSAGE = '検索をキャンセルしました。'

export const useSearchStore = defineStore('search', () => {
  const master = useMasterStore()
  const conditions = useConditionsStore()
  const toast = useToastStore()
  const charmsStore = useCharmsStore()

  const status = ref<SearchStatus>('idle')
  const found = ref(0)
  const response = ref<SolverResponse | null>(null)
  const errorMessage = ref('')
  const summary = ref<SearchSummary | null>(null)
  /** 送信した時点の護石の候補（ID で引く）。構成の表示はここから護石を引く */
  const submittedCharms = shallowRef<ReadonlyMap<string, SolverCharm>>(new Map())
  // 検索を始めるたびに増やす（結果パネルの見出しへフォーカスを移す合図）
  const runCount = ref(0)

  // 護石の読込を待っている間の印と、取り消しで待ちを無効にするための番号
  let waiting = false
  let waitToken = 0

  function clearResult(): void {
    found.value = 0
    response.value = null
    errorMessage.value = ''
  }

  function summarize(weaponId: WeaponId, charmCount: number): SearchSummary {
    return {
      weaponId,
      weaponName: master.nameOf(weaponId),
      requiredCount: conditions.required.length,
      objectiveLabel: objectiveLabel(conditions.objective),
      maxResults: conditions.maxResults,
      allRanksSelected: conditions.ranks.length === master.availableRanks.length,
      charmCount,
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
    // 前の検索の結果と進捗はすぐに消す
    clearResult()
    status.value = 'searching'
    runCount.value += 1
    if (charmsStore.status !== 'loading') {
      dispatch(bundle, weaponId)
      return true
    }
    // 護石の読込の前に送ると登録済みの護石が落ちるので、読込の完了を待ってから送る
    waiting = true
    const token = ++waitToken
    void charmsStore.ensureLoaded().then(() => {
      if (token !== waitToken) return
      waiting = false
      dispatch(bundle, weaponId)
    })
    return true
  }

  function dispatch(bundle: NonNullable<typeof master.bundle>, weaponId: WeaponId): void {
    // ストアの候補は読み込み後に差し替わるので、送信の時点の写しを取る
    const charms = charmsStore.candidates.map((charm) => structuredClone(toRaw(charm)))
    const request = buildSolverRequest(bundle, {
      weaponId,
      required: conditions.required,
      objective: conditions.objective,
      maxResults: conditions.maxResults,
      ranks: conditions.ranks,
      charms,
    })
    // 送信した時点の候補を持つ（検索の後に護石を編集・削除しても、表示中の結果は変えない）
    submittedCharms.value = new Map(charms.map((charm) => [charm.id, charm]))
    summary.value = summarize(weaponId, charms.length)
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
  }

  /** 検索中の検索を取り消し、Q0 に戻す。 */
  function cancel(): void {
    if (status.value !== 'searching') return
    if (waiting) {
      // 護石の読込を待っていて、まだ送っていない
      waiting = false
      waitToken += 1
    } else {
      master.cancelSolve()
    }
    clearResult()
    status.value = 'idle'
    toast.push(CANCELLED_TOAST_MESSAGE)
  }

  return {
    status,
    found,
    response,
    errorMessage,
    summary,
    submittedCharms,
    runCount,
    submit,
    cancel,
  }
})

import { ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type { ConditionId, WeaponId } from '@swv/data'
import type { DamageBase, SolvedBuild, SolverCharm, SolverResponse } from '@swv/solver'
import { objectiveLabel } from '@/constants/labels'
import { buildSolverRequest, type SearchConditions } from '@/lib/solver/request'
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
  /** 検索したときにオンだった発動条件の名前（トグルの並びの順） */
  activeConditionNames: string[]
  /** 送信した時点の護石の候補の件数 */
  charmCount: number
}

/** 検索したときの火力の計算の元（検索の後に変えても変わらない）。 */
export interface SubmittedBasis {
  damageBase: DamageBase
  activeConditionIds: ConditionId[]
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
  /** 検索中に Worker から届いた構成（届いた順）。結果・取り消し・エラー・新しい検索で空にする */
  const progressBuilds = shallowRef<readonly SolvedBuild[]>([])
  const errorMessage = ref('')
  const summary = ref<SearchSummary | null>(null)
  /** 送信した時点の護石の候補（ID で引く）。構成の表示はここから護石を引く */
  const submittedCharms = shallowRef<ReadonlyMap<string, SolverCharm>>(new Map())
  /** 送信した時点の武器の攻撃力・会心率とオンの発動条件。火力の計算に使う */
  const submittedBasis = shallowRef<SubmittedBasis | null>(null)
  // 検索を始めるたびに増やす（結果パネルの見出しへフォーカスを移す合図）
  const runCount = ref(0)

  // 護石の読込を待っている間の印と、取り消しで待ちを無効にするための番号
  let waiting = false
  let waitToken = 0

  function clearResult(): void {
    found.value = 0
    progressBuilds.value = []
    response.value = null
    errorMessage.value = ''
  }

  /** 送信した時点の条件の写し（護石の候補を除く）。待っている間に条件を編集しても変わらない。 */
  type Submitted = Omit<SearchConditions, 'charms'> & {
    bundle: NonNullable<typeof master.bundle>
    damageBase: DamageBase
  }

  function summarize(submitted: Submitted, charmCount: number): SearchSummary {
    return {
      weaponId: submitted.weaponId,
      weaponName: master.nameOf(submitted.weaponId),
      requiredCount: submitted.required.length,
      objectiveLabel: objectiveLabel(submitted.objective),
      maxResults: submitted.maxResults,
      allRanksSelected: submitted.ranks.length === master.availableRanks.length,
      activeConditionNames: submitted.activeConditionIds.map((id) => master.nameOf(id)),
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
    const weapon = conditions.weapon
    if (
      conditions.unavailableReason !== null ||
      bundle === null ||
      weaponId === null ||
      weapon === null
    ) {
      conditions.showWeaponError()
      return false
    }
    // 進行中の護石の読込待ちがあれば無効にする（二重送信と古い waiting の残りを防ぐ）
    waiting = false
    waitToken += 1
    const submitted: Submitted = {
      bundle,
      damageBase: { attack: weapon.attack, affinity: weapon.affinity },
      activeConditionIds: [...conditions.activeConditionIds],
      weaponId,
      required: conditions.required.map((skill) => ({ ...skill })),
      objective: conditions.objective,
      maxResults: conditions.maxResults,
      ranks: [...conditions.ranks],
    }
    // 前の検索の結果と進捗はすぐに消す
    clearResult()
    status.value = 'searching'
    runCount.value += 1
    if (charmsStore.status !== 'loading') {
      dispatch(submitted)
      return true
    }
    // 護石の読込の前に送ると登録済みの護石が落ちるので、読込の完了を待ってから送る
    waiting = true
    const token = waitToken
    void charmsStore.ensureLoaded().then(() => {
      if (token !== waitToken) return
      waiting = false
      dispatch(submitted)
    })
    return true
  }

  function dispatch(submitted: Submitted): void {
    // ストアの候補は読み込み後に差し替わるので、送信の時点の写しを取る
    const charms = charmsStore.candidates.map((charm) => structuredClone(toRaw(charm)))
    const { bundle, damageBase, ...rest } = submitted
    const request = buildSolverRequest(bundle, { ...rest, charms })
    // 送信した時点の候補を持つ（検索の後に護石を編集・削除しても、表示中の結果は変えない）
    submittedCharms.value = new Map(charms.map((charm) => [charm.id, charm]))
    // 結果の火力の計算には、この写しだけを使う（検索の後のトグル・武器の変更に影響されない）
    submittedBasis.value = { damageBase, activeConditionIds: rest.activeConditionIds }
    summary.value = summarize(submitted, charms.length)
    master.solve(request, {
      onProgress: (count, build) => {
        progressBuilds.value = [...progressBuilds.value, build]
        found.value = count
      },
      onResult: (result) => {
        response.value = result
        progressBuilds.value = []
        found.value = result.builds.length
        status.value = 'done'
      },
      onError: (message) => {
        errorMessage.value = message
        progressBuilds.value = []
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
    progressBuilds,
    errorMessage,
    summary,
    submittedCharms,
    submittedBasis,
    runCount,
    submit,
    cancel,
  }
})

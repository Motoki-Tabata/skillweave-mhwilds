import { ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type { ConditionId } from '@swv/data'
import type { DamageBase, SolvedBuild, SolverCharm, SolverResponse } from '@swv/solver'
import { objectiveLabel } from '@/constants/labels'
import type { BuildPayload, BuildWeapon } from '@/lib/api/builds'
import { buildPayloadOf, customWeaponSnapshot } from '@/lib/builds/payload'
import { buildSolverRequest, type SearchConditions } from '@/lib/solver/request'
import { useCharmsStore } from '@/stores/charms'
import { useConditionsStore } from '@/stores/conditions'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { useMasterStore } from '@/stores/master'
import { useToastStore } from '@/stores/toast'

/** Q0 未検索（キャンセルの後を含む）／Q1 検索中／結果（Q2〜Q5）／Q6 エラー。 */
export type SearchStatus = 'idle' | 'searching' | 'done' | 'error'

/** 検索したときの条件の要約。検索の後に条件を変えても変わらない。 */
export interface SearchSummary {
  /** 要約に出す武器の名前（個体差のある武器は「<表示名>（個体差）」） */
  weaponName: string
  /** 送信した時点の武器のスロット。構成の表示が装飾品の Lv を引く */
  weaponSlots: readonly { level: number }[]
  requiredCount: number
  objectiveLabel: string
  maxResults: number
  allRanksSelected: boolean
  /** 検索したときにオンだった発動条件の名前（トグルの並びの順） */
  activeConditionNames: string[]
  /** 送信した時点の鑑定護石の候補の件数 */
  charmCount: number
  /** 送信した時点の「生産護石を候補に含める」の値 */
  includeCraftedCharms: boolean
  /** 送信した時点で固定した部位の数（「何も付けない」を含む） */
  fixedPartCount: number
  /** 送信した時点でユーザーが除外した防具の件数（ランクで外した分は数えない） */
  excludedArmorCount: number
  /** 送信した時点でユーザーが除外した装飾品の件数 */
  excludedDecorationCount: number
}

/** 検索したときの火力の計算の元（検索の後に変えても変わらない）。 */
export interface SubmittedBasis {
  damageBase: DamageBase
  activeConditionIds: ConditionId[]
}

/** 構成の保存に使う、送信した時点の写し（マスターの版と武器の参照・写し）。 */
export interface SubmittedSaveSource {
  masterVersion: string
  weapon: BuildWeapon
}

export const CANCELLED_TOAST_MESSAGE = '検索をキャンセルしました。'

export const useSearchStore = defineStore('search', () => {
  const master = useMasterStore()
  const conditions = useConditionsStore()
  const toast = useToastStore()
  const charmsStore = useCharmsStore()
  const lockExclude = useLockExcludeStore()

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
  /** 送信した時点のマスターの版と武器の写し。構成の保存はここから作る */
  const submittedSaveSource = shallowRef<SubmittedSaveSource | null>(null)
  /** 「保存済み」の印を付けた結果の位置。検索し直すと消す */
  const savedIndexes = ref<readonly number[]>([])
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
    savedIndexes.value = []
  }

  /** 結果の構成から保存する `payload` を作る。検索の結果が無いときは null。 */
  function buildPayload(build: SolvedBuild): BuildPayload | null {
    const source = submittedSaveSource.value
    const basis = submittedBasis.value
    if (source === null || basis === null) return null
    return buildPayloadOf(build, {
      weapon: source.weapon,
      charms: submittedCharms.value,
      activeConditionIds: basis.activeConditionIds,
    })
  }

  /** 結果の構成（先頭から数えた位置）を保存済みにする。 */
  function markSaved(index: number): void {
    if (!savedIndexes.value.includes(index)) savedIndexes.value = [...savedIndexes.value, index]
  }

  function isSaved(index: number): boolean {
    return savedIndexes.value.includes(index)
  }

  /** 送信した時点の条件の写し（護石の候補を除く）。待っている間に条件を編集しても変わらない。 */
  type Submitted = Omit<SearchConditions, 'charms'> & {
    bundle: NonNullable<typeof master.bundle>
    damageBase: DamageBase
    weaponName: string
    weaponSlots: readonly { level: number }[]
    /** 構成の保存に使う、送信した時点のマスターの版と武器の参照・写し */
    saveSource: SubmittedSaveSource
    /** 送信した時点の「生産護石を候補に含める」の値 */
    includeCraftedCharms: boolean
  }

  function summarize(submitted: Submitted, charmCount: number): SearchSummary {
    return {
      weaponName: submitted.weaponName,
      weaponSlots: submitted.weaponSlots,
      requiredCount: submitted.required.length,
      objectiveLabel: objectiveLabel(submitted.objective),
      maxResults: submitted.maxResults,
      allRanksSelected: submitted.ranks.length === master.availableRanks.length,
      activeConditionNames: submitted.activeConditionIds.map((id) => master.nameOf(id)),
      charmCount,
      includeCraftedCharms: submitted.includeCraftedCharms,
      fixedPartCount: Object.keys(submitted.fixedArmor).length,
      excludedArmorCount: submitted.excludedArmorIds.length,
      excludedDecorationCount: submitted.excludedDecorationIds.length,
    }
  }

  /**
   * 検索を始める。検索できない理由があれば始めずに false を返す
   * （武器の欄のエラーを出す。ランクのエラーは常に出ている）。
   */
  function submit(): boolean {
    const bundle = master.bundle
    const weapon = conditions.weapon
    if (conditions.unavailableReason !== null || bundle === null || weapon === null) {
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
      // 検索の後に武器を編集・削除しても変わらないよう、送信した時点の写しを持つ
      weapon: structuredClone(toRaw(weapon.solverWeapon)),
      weaponName: weapon.kind === 'custom' ? `${weapon.name}（個体差）` : weapon.name,
      weaponSlots: weapon.slots.map((slot) => ({ level: slot.level })),
      saveSource: {
        masterVersion: bundle.version,
        weapon:
          weapon.kind === 'custom' && weapon.stored !== undefined
            ? customWeaponSnapshot(weapon.stored)
            : { kind: 'master', weaponId: weapon.id },
      },
      required: conditions.required.map((skill) => ({ ...skill })),
      objective: conditions.objective,
      maxResults: conditions.maxResults,
      ranks: [...conditions.ranks],
      includeCraftedCharms: conditions.includeCraftedCharms,
      fixedArmor: { ...lockExclude.fixed },
      excludedArmorIds: [...lockExclude.excludedArmorIds],
      excludedDecorationIds: [...lockExclude.excludedDecorationIds],
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
    const appraised = charmsStore.candidates.map((charm) => structuredClone(toRaw(charm)))
    const crafted = submitted.includeCraftedCharms
      ? master.craftedCharms.map((charm) => structuredClone(toRaw(charm)))
      : []
    const charms = [...appraised, ...crafted]
    const { bundle, damageBase, saveSource, ...rest } = submitted
    submittedSaveSource.value = saveSource
    const request = buildSolverRequest(bundle, { ...rest, charms })
    // 送信した時点の候補を持つ（検索の後に護石を編集・削除しても、表示中の結果は変えない）
    submittedCharms.value = new Map(charms.map((charm) => [charm.id, charm]))
    // 結果の火力の計算には、この写しだけを使う（検索の後のトグル・武器の変更に影響されない）
    submittedBasis.value = { damageBase, activeConditionIds: rest.activeConditionIds }
    summary.value = summarize(submitted, appraised.length)
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
    submittedSaveSource,
    savedIndexes,
    buildPayload,
    markSaved,
    isSaved,
    submit,
    cancel,
  }
})

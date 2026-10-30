import { computed } from 'vue'
import { defineStore } from 'pinia'
import type { SolverCharm } from '@swv/solver'
import { charmsApi } from '@/lib/api/charms'
import { matchCharm } from '@/lib/charms/match'
import type { CharmMatch } from '@/lib/charms/match'
import { eligibleSolverCharms } from '@/lib/charms/eligible'
import { CHARM_SCHEMA_VERSION, openCharmRepository } from '@/lib/charms/storage'
import type { CharmRepository, StoredCharm } from '@/lib/charms/storage'
import type { CharmPayload } from '@/lib/charms/types'
import { charmEligibility } from '@/lib/charms/validate'
import type { CharmEligibility, ValidateContext } from '@/lib/charms/validate'
import { useSavedItems } from '@/stores/savedItems'
import type { SavedItemsSource, SavedItemsStatus, SavedWriteResult } from '@/stores/savedItems'
import { useMasterStore } from '@/stores/master'

/** 読込中・読込済み・端末に保存できない（IndexedDB を開けない）・読み込みの失敗（一覧を読めない）。 */
export type CharmsStatus = SavedItemsStatus

/** 護石の保存先。判定中は未定。 */
export type CharmSource = SavedItemsSource

/** `save`・`remove` の結果（`SavedWriteResult` と同じ）。 */
export type CharmWriteResult = SavedWriteResult

/** 護石の保存先を開く関数。テストで差し替える。 */
export type CharmRepositoryOpener = () => Promise<CharmRepository>

/** 一覧の1件。マスターの読み込み前は、照合の結果と候補の判定を持たない。 */
export interface CharmEntry {
  charm: StoredCharm
  match: CharmMatch | null
  eligibility: CharmEligibility | null
}

const MESSAGE_CONFLICT =
  'この護石は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。'
const MESSAGE_NOT_FOUND =
  'この護石は別の端末で削除されていたため、保存しませんでした。一覧を読み直しました。'
const MESSAGE_EXPIRED_WRITE =
  'ログインの有効期限が切れたため、保存しませんでした。端末内の護石に切り替えました。アカウントに保存するには、もう一度「Discord でログイン」を押してください。'
const MESSAGE_EXPIRED_LIST =
  'ログインの有効期限が切れました。端末内の護石に切り替えました。もう一度「Discord でログイン」を押すと、アカウントの護石を使えます。'

/** リアクティブな値を、IndexedDB に渡せる（structuredClone できる）素のオブジェクトにする。 */
function plainPayload(payload: CharmPayload): CharmPayload {
  return {
    rarity: payload.rarity,
    skills: payload.skills.map((skill) => ({ skillId: skill.skillId, level: skill.level })),
    slots: payload.slots.map((slot) => ({ target: slot.target, level: slot.level })),
  }
}

/** 護石の一覧と、保存先（アカウントか端末）への保存（S1 と S2 が共有する）。 */
export const useCharmsStore = defineStore('charms', () => {
  const master = useMasterStore()

  const saved = useSavedItems<StoredCharm, CharmPayload, 1>({
    plainPayload,
    schemaVersion: CHARM_SCHEMA_VERSION,
    openDefault: () => openCharmRepository(),
    noun: '護石',
    api: charmsApi,
    messages: {
      conflict: MESSAGE_CONFLICT,
      notFound: MESSAGE_NOT_FOUND,
      expiredWrite: MESSAGE_EXPIRED_WRITE,
      expiredList: MESSAGE_EXPIRED_LIST,
    },
  })
  const charms = saved.items

  const context = computed<ValidateContext | null>(() => {
    const bundle = master.bundle
    return bundle === null ? null : { bundle, nameOf: master.nameOf }
  })

  /** 各護石の照合の結果と候補の判定。保存はせず、表示のたびに現行のマスターで求める。 */
  const entries = computed<CharmEntry[]>(() => {
    const ctx = context.value
    return charms.value.map((charm) =>
      ctx === null
        ? { charm, match: null, eligibility: null }
        : {
            charm,
            match: matchCharm(charm.payload, ctx.bundle, ctx.nameOf),
            eligibility: charmEligibility(charm.payload, ctx),
          },
    )
  })

  /** 検索の候補にする護石（構造上の制約を満たすものすべて。未検査・テーブル不一致を含む）。 */
  const candidates = computed<SolverCharm[]>(() =>
    context.value === null ? [] : eligibleSolverCharms(charms.value, context.value),
  )
  const candidateCount = computed(() => candidates.value.length)

  /** 検索の候補から外す護石と、その理由。 */
  const excluded = computed(() =>
    entries.value.flatMap(({ charm, eligibility }) =>
      eligibility !== null && !eligibility.eligible
        ? [{ id: charm.id, reasons: eligibility.reasons }]
        : [],
    ),
  )
  const excludedCount = computed(() => excluded.value.length)

  return {
    status: saved.status,
    source: saved.source,
    failureMessage: saved.failureMessage,
    charms,
    deviceCharmCount: saved.deviceCount,
    deletingIds: saved.deletingIds,
    importing: saved.importing,
    importFromDevice: saved.importFromDevice,
    entries,
    candidates,
    candidateCount,
    excluded,
    excludedCount,
    setRepositoryOpener: saved.setRepositoryOpener,
    setApi: saved.setApi,
    ensureLoaded: saved.ensureLoaded,
    reload: saved.reload,
    save: saved.save,
    remove: saved.remove,
  }
})

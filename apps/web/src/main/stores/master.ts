import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  ArmorRank,
  MasterArmor,
  MasterBundle,
  MasterDecoration,
  MasterDictionary,
  MasterSkill,
  MasterWeapon,
  SkillKind,
} from '@swv/data'
import type { SolverRequest } from '@swv/solver'
import { ARMOR_RANKS, SKILL_KINDS } from '@/constants/labels'
import { createSolverClient } from '@/lib/solver/client'
import type { SolveHandlers } from '@/lib/solver/client'
import { fetchMasterData, loadFailureMessage } from '@/lib/solver/masterData'
import { compareJa } from '@/lib/text'

export type LoadStatus = 'loading' | 'ready' | 'failed'

function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

/** マスター・辞書・HiGHS の読み込み（P1〜P3）と、読み込んだマスターの参照を持つ。 */
export const useMasterStore = defineStore('master', () => {
  const client = createSolverClient()
  const status = ref<LoadStatus>('loading')
  const failureMessage = ref('')
  // マスターは大きいので、中身まではリアクティブにしない
  const bundle = shallowRef<MasterBundle | null>(null)
  const dictionary = shallowRef<MasterDictionary | null>(null)
  let loadSerial = 0

  /** 最初から（Worker の作り直し・取得を含めて）読み込む。「再読み込み」も同じ。 */
  async function load(): Promise<void> {
    const serial = ++loadSerial
    status.value = 'loading'
    failureMessage.value = ''
    client.start()
    try {
      const data = await fetchMasterData()
      if (serial !== loadSerial) return
      await client.load(data.bundle)
      if (serial !== loadSerial) return
      bundle.value = data.bundle
      dictionary.value = data.dictionary
      status.value = 'ready'
    } catch (e) {
      if (serial !== loadSerial) return
      failureMessage.value = loadFailureMessage(e)
      status.value = 'failed'
    }
  }

  const weaponById = computed(() => indexById<MasterWeapon>(bundle.value?.weapons ?? []))
  const skillById = computed(() => indexById<MasterSkill>(bundle.value?.skills ?? []))
  const armorById = computed(() => indexById<MasterArmor>(bundle.value?.armors ?? []))
  const decorationById = computed(() =>
    indexById<MasterDecoration>(bundle.value?.decorations ?? []),
  )

  /** 辞書に名前が無い ID は、ID の文字列をそのまま返す。 */
  function nameOf(id: string): string {
    return dictionary.value?.entries[id]?.name ?? id
  }

  /** マスターに含まれるランク（低い順）。 */
  const availableRanks = computed<ArmorRank[]>(() => {
    const present = new Set(bundle.value?.armors.map((armor) => armor.rank))
    return ARMOR_RANKS.filter((rank) => present.has(rank.id)).map((rank) => rank.id)
  })

  /** マスターのスキルを種類ごとに ja の名前の順で並べたもの。 */
  const skillsByKind = computed(() => {
    const result = new Map<SkillKind, MasterSkill[]>()
    for (const kind of SKILL_KINDS) {
      const skills = (bundle.value?.skills ?? []).filter((skill) => skill.kind === kind.id)
      skills.sort((a, b) => compareJa(nameOf(a.id), nameOf(b.id)))
      result.set(kind.id, skills)
    }
    return result
  })

  function solve(request: SolverRequest, handlers: SolveHandlers): string {
    return client.solve(request, handlers)
  }

  function cancelSolve(): void {
    client.cancel()
  }

  return {
    status,
    failureMessage,
    bundle,
    dictionary,
    load,
    weaponById,
    skillById,
    armorById,
    decorationById,
    nameOf,
    availableRanks,
    skillsByKind,
    solve,
    cancelSolve,
  }
})

import type {
  ArmorId,
  ArmorPart,
  ArmorRank,
  ConditionId,
  DecorationId,
  Effect,
  MasterArmor,
  MasterBundle,
  MasterCondition,
  MasterDictionary,
  MasterSkill,
  MasterVersion,
  MasterWeapon,
  SkillId,
  SkillKind,
  Slot,
  WeaponId,
} from '@swv/data'
import type { SolvedBuild, WorkerInbound } from '@swv/solver'
import type { SolverWorkerOutbound, WorkerLike } from '@/lib/solver/client'

/** 単体テスト用の小さなマスター（ランクは下位・上位。武器種は大剣・太刀・弓）。 */

export const VERSION = 'test-1' as MasterVersion
export const SOURCE = {
  repository: 'example/mhdb-test',
  commit: '0123456789abcdef0123456789abcdef01234567',
}

export const sk = (id: string) => `sk:${id}` as SkillId
export const wp = (id: string) => `wp:${id}` as WeaponId
export const ar = (id: string) => id as ArmorId
export const dc = (id: string) => `dc:${id}` as DecorationId

export const PARTS: ArmorPart[] = ['head', 'chest', 'arms', 'waist', 'legs']
const PART_LABEL: Record<ArmorPart, string> = {
  head: '頭',
  chest: '胴',
  arms: '腕',
  waist: '腰',
  legs: '脚',
}

export const armorId = (rank: ArmorRank, part: ArmorPart) => ar(`ar:${rank}:${part}`)

export const cd = (id: string) => `cd:${id}` as ConditionId

/** 発動条件（辞書の名前は NAMES）。トグルの並びは ja の名前順なので、ID 順とは一致しない。 */
export const CONDITIONS: MasterCondition[] = [
  { id: cd('weak_point') },
  { id: cd('wound') },
  { id: cd('challenger') },
]

function skill(
  id: string,
  kind: SkillKind,
  maxLevel: number,
  effectsByLevel: Effect[][] = [],
): MasterSkill {
  return { id: sk(id), kind, maxLevel, effectsByLevel }
}

export const SKILLS: MasterSkill[] = [
  // 剛刃: Lv1〜5。効果は Lv5 だけ（効果が無いレベルの確認用）
  skill('w1', 'weapon', 5, [[], [], [], [], [{ stat: 'attack_add', value: 10 }]]),
  // 攻撃: Lv1〜3。常時の効果と、条件付きの効果
  skill('a1', 'armor', 3, [
    [{ stat: 'attack_add', value: 3 }],
    [{ stat: 'attack_add', value: 6 }],
    [
      { stat: 'attack_mul', value: 1.04 },
      { stat: 'attack_add', value: 9 },
      { stat: 'affinity_add', value: 20, conditionId: cd('weak_point') },
    ],
  ]),
  skill('a2', 'armor', 4),
  skill('s1', 'series', 2),
  skill('g1', 'group', 1),
]

const slot = (target: Slot['target'], level: Slot['level']): Slot => ({ target, level })

function makeWeapons(extraGreatSwords = 0): MasterWeapon[] {
  const base: MasterWeapon[] = [
    {
      id: wp('great-sword:1'),
      weaponType: 'great-sword',
      attack: 250,
      affinity: -15,
      slots: [slot('weapon', 3), slot('weapon', 1)],
      skills: [{ skillId: sk('w1'), level: 2 }],
      setBonusIds: [],
    },
    {
      id: wp('long-sword:1'),
      weaponType: 'long-sword',
      attack: 210,
      affinity: 25,
      slots: [],
      skills: [],
      setBonusIds: [],
    },
    {
      id: wp('bow:1'),
      weaponType: 'bow',
      attack: 90,
      affinity: 0,
      slots: [],
      skills: [],
      setBonusIds: [],
    },
  ]
  for (let i = 0; i < extraGreatSwords; i += 1) {
    base.push({
      id: wp(`great-sword:x${i + 10}`),
      weaponType: 'great-sword',
      attack: 100 + i,
      affinity: 0,
      slots: [],
      skills: [],
      setBonusIds: [],
    })
  }
  return base
}

function makeArmors(ranks: ArmorRank[]): MasterArmor[] {
  return ranks.flatMap((rank) =>
    PARTS.map((part) => ({
      id: armorId(rank, part),
      part,
      rarity: rank === 'low' ? 2 : 6,
      rank,
      slots: part === 'head' && rank === 'high' ? [slot('armor', 2)] : [],
      skills: [],
      setBonusIds: [],
      defense: rank === 'low' ? 10 : 20,
    })),
  )
}

export interface BundleOptions {
  ranks?: ArmorRank[]
  /** 大剣を追加で増やす数（D1 の 50 件の上限の確認用）。 */
  extraGreatSwords?: number
}

export function makeBundle(options: BundleOptions = {}): MasterBundle {
  return {
    version: VERSION,
    source: SOURCE,
    skills: SKILLS,
    setBonuses: [],
    armors: makeArmors(options.ranks ?? ['low', 'high']),
    decorations: [
      { id: dc('1'), target: 'armor', slotLevel: 2, skills: [{ skillId: sk('a1'), level: 1 }] },
    ],
    weapons: makeWeapons(options.extraGreatSwords ?? 0),
    charms: [],
    appraisedCharm: { patterns: [], groups: [] },
    conditions: CONDITIONS,
  }
}

const RANK_LABEL: Record<ArmorRank, string> = { low: '下位', high: '上位', master: 'マスター' }

export const NAMES: Record<string, string> = {
  [sk('w1')]: '剛刃',
  [sk('a1')]: '攻撃',
  [sk('a2')]: 'ガード',
  [sk('s1')]: '火竜の力',
  [sk('g1')]: '不屈の極み',
  [wp('great-sword:1')]: '鉄の大剣',
  [wp('long-sword:1')]: '鉄の太刀',
  [wp('bow:1')]: '鉄の弓',
  [dc('1')]: '攻撃珠【２】',
  [cd('weak_point')]: '有効部位への攻撃',
  [cd('wound')]: '傷口への攻撃',
  [cd('challenger')]: '挑戦者の発動中',
}

/** スキルのレベルごとの説明文（index 0 = Lv1）。空文字は「説明文が無い」。 */
export const LEVEL_DESCRIPTIONS: Record<string, string[]> = {
  [sk('a1')]: [
    '攻撃力が少し上がる。',
    '攻撃力が上がる。',
    '攻撃力が大きく上がる。\r\n会心率も上がる。',
  ],
  [sk('w1')]: ['', '武器の切れ味が増す。'],
}

/** スキルの読み（ひらがなと「ー」）。 */
export const READINGS: Record<string, string> = {
  [sk('w1')]: 'ごうじん',
  [sk('a1')]: 'こうげき',
  [sk('a2')]: 'がーど',
}

export function makeDictionary(options: BundleOptions = {}): MasterDictionary {
  const entries: MasterDictionary['entries'] = {}
  for (const [id, name] of Object.entries(NAMES)) {
    entries[id] = { name, reading: READINGS[id], levelDescriptions: LEVEL_DESCRIPTIONS[id] }
  }
  for (const rank of options.ranks ?? ['low', 'high']) {
    for (const part of PARTS) {
      entries[armorId(rank, part)] = { name: `${RANK_LABEL[rank]}の${PART_LABEL[part]}` }
    }
  }
  for (let i = 0; i < (options.extraGreatSwords ?? 0); i += 1) {
    entries[wp(`great-sword:x${i + 10}`)] = { name: `試作大剣${i + 10}` }
  }
  return { version: VERSION, locale: 'ja', entries }
}

/** 構成1件（頭は上位、残りは防具なし。頭の防具スロットに装飾品、武器スロットが空き）。 */
export function makeBuild(): SolvedBuild {
  return {
    armor: { head: armorId('high', 'head'), chest: null, arms: null, waist: null, legs: null },
    charmId: null,
    decorations: [{ slot: { owner: 'head', index: 0 }, decorationId: dc('1') }],
    skills: [
      { skillId: sk('a1'), level: 1, rawLevel: 1 },
      { skillId: sk('w1'), level: 2, rawLevel: 2 },
    ],
    freeSlots: [
      { owner: 'weapon', index: 0 },
      { owner: 'weapon', index: 1 },
    ],
  }
}

/** Worker の偽物。送られたメッセージを記録し、手動で応答を返せる。 */
export class FakeWorker implements WorkerLike {
  static instances: FakeWorker[] = []
  /** true のとき、loadMaster に initFailed で応える（HiGHS の初期化失敗）。 */
  static failInit = false
  /** false のとき、loadMaster に応えない（読み込み中のまま）。 */
  static autoReply = true

  static reset(): void {
    FakeWorker.instances = []
    FakeWorker.failInit = false
    FakeWorker.autoReply = true
  }

  static get last(): FakeWorker {
    const worker = FakeWorker.instances.at(-1)
    if (worker === undefined) throw new Error('Worker が作られていません')
    return worker
  }

  sent: WorkerInbound[] = []
  terminated = false
  onmessage: ((event: { data: SolverWorkerOutbound }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: WorkerInbound): void {
    this.sent.push(message)
    if (message.type !== 'loadMaster' || !FakeWorker.autoReply) return
    if (FakeWorker.failInit) this.emit({ type: 'initFailed', message: 'wasm' })
    else this.emit({ type: 'masterLoaded', version: message.bundle.version })
  }

  terminate(): void {
    this.terminated = true
  }

  emit(data: SolverWorkerOutbound): void {
    this.onmessage?.({ data })
  }

  crash(): void {
    this.onerror?.(new Error('crash'))
  }

  /** 送られた solve の requestId（最後のもの）。 */
  get lastSolveId(): string {
    const solves = this.sent.filter((m) => m.type === 'solve')
    const last = solves.at(-1)
    if (last === undefined) throw new Error('solve が送られていません')
    return last.requestId
  }

  messages(type: WorkerInbound['type']): WorkerInbound[] {
    return this.sent.filter((m) => m.type === type)
  }
}

export interface FetchStubOptions {
  bundle?: MasterBundle
  dictionary?: MasterDictionary
  /** 失敗させる取得（HTTP 500 を返す）。 */
  failMaster?: boolean
  failDictionary?: boolean
  /** true のとき、取得が終わらない。 */
  hang?: boolean
}

/** `fetch` の偽物。URL がマスターの本体か辞書かで返す JSON を変える。 */
export function createFetchStub(options: FetchStubOptions = {}) {
  const bundle = options.bundle ?? makeBundle()
  const dictionary = options.dictionary ?? makeDictionary()
  return async (input: RequestInfo | URL): Promise<Response> => {
    if (options.hang) return new Promise<Response>(() => {})
    const url = String(input)
    const isDictionary = url.endsWith('.ja.json')
    const failed = isDictionary ? options.failDictionary : options.failMaster
    if (failed) {
      return {
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => '',
      } as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => (isDictionary ? dictionary : bundle),
    } as Response
  }
}

const slotOf = (target: Slot['target'], level: Slot['level']): Slot => ({ target, level })

/**
 * テスト用の抽選テーブル（実データではない）を持つマスター。レア8 に2つのパターンがあり、レア7 は無い。
 * - P1: スキル1 = A（攻撃 Lv1・2、剛刃 Lv1）、スキル2 = B（ガード Lv1）、スロット [武器用 Lv1] か [武器用 Lv1・防具用 Lv2]
 * - P2: スキル1 = C（剛刃 Lv3）、スロットなし
 */
export function makeTableBundle(): MasterBundle {
  const bundle = makeBundle()
  bundle.appraisedCharm = {
    groups: [
      {
        group: 'A',
        skills: [
          { skillId: sk('a1'), level: 1 },
          { skillId: sk('a1'), level: 2 },
          { skillId: sk('w1'), level: 1 },
        ],
      },
      { group: 'B', skills: [{ skillId: sk('a2'), level: 1 }] },
      { group: 'C', skills: [{ skillId: sk('w1'), level: 3 }] },
    ],
    patterns: [
      {
        rarity: 8,
        skillGroups: ['A', 'B', null],
        slotPatterns: [[slotOf('weapon', 1)], [slotOf('weapon', 1), slotOf('armor', 2)]],
      },
      { rarity: 8, skillGroups: ['C', null, null], slotPatterns: [[]] },
    ],
  }
  return bundle
}

import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Effect, MasterBundle, MasterDictionary } from '../../main/index.ts'
import { SKILL_CATEGORIES } from '../../main/pipeline/categories.ts'
import { MASTER_VERSION, MHDB_COMMIT, MHDB_REPOSITORY } from '../../main/pipeline/config.ts'
import { formatViolation, validate } from '../../main/pipeline/validate.ts'

const DIST = fileURLToPath(new URL('../../../dist/', import.meta.url))
const BUNDLE = `master-${MASTER_VERSION}.json`
const JA = `master-${MASTER_VERSION}.ja.json`
const EN = `master-${MASTER_VERSION}.en.json`

const readJson = async <T>(name: string): Promise<T> =>
  JSON.parse(await readFile(`${DIST}${name}`, 'utf8')) as T

describe('コミット済みの dist/（受入基準 9・12・13・14。ネットワーク不使用）', () => {
  it('設定の版のファイルだけがある（12）', async () => {
    const masters = (await readdir(DIST)).filter((name) => /^master-.*\.json$/.test(name))
    expect(masters.sort()).toEqual([EN, JA, BUNDLE].sort())
  })

  it('MasterBundle の取得元と版が設定と一致する（13）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    expect(bundle.version).toBe(MASTER_VERSION)
    expect(bundle.source).toEqual({ repository: MHDB_REPOSITORY, commit: MHDB_COMMIT })
  })

  it('辞書は ja と en で、版が設定と一致する（5）', async () => {
    const ja = await readJson<MasterDictionary>(JA)
    const en = await readJson<MasterDictionary>(EN)
    expect([ja.locale, en.locale]).toEqual(['ja', 'en'])
    expect([ja.version, en.version]).toEqual([MASTER_VERSION, MASTER_VERSION])
  })

  it('全防具に rank があり、版が 2026.11.4 である（12。006 受入基準 3・037 AC-5・038 AC-5・043 AC-4）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    expect(bundle.version).toBe('2026.11.4')
    expect(MASTER_VERSION).toBe('2026.11.4')
    expect(bundle.armors.length).toBeGreaterThan(0)
    for (const armor of bundle.armors) {
      expect(['low', 'high', 'master'], armor.id).toContain(armor.rank)
    }
  })

  it('ja の辞書のすべてのスキルに読みがあり、en に読みが無い（受入基準 13）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const ja = await readJson<MasterDictionary>(JA)
    const en = await readJson<MasterDictionary>(EN)
    for (const skill of bundle.skills) {
      expect(ja.entries[skill.id]?.reading, skill.id).toMatch(/^[ぁ-ゖー]+$/u)
    }
    expect(Object.values(en.entries).filter((e) => e.reading !== undefined)).toEqual([])
  })

  it('検証の関数で違反が0件（14）', async () => {
    const violations = validate({
      bundle: await readJson<MasterBundle>(BUNDLE),
      dictionaries: {
        ja: await readJson<MasterDictionary>(JA),
        en: await readJson<MasterDictionary>(EN),
      },
    })
    expect(violations.map(formatViolation)).toEqual([])
  })

  it('すべてのスキルが 9 つの分類のどれか 1 つを持ち、代表のスキルの割当が正しい（022 AC-1）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    expect(bundle.skills.length).toBeGreaterThan(0)
    for (const skill of bundle.skills) {
      expect(SKILL_CATEGORIES, skill.id).toContain(skill.category)
    }
    const category = (id: string) => bundle.skills.find((s) => s.id === id)?.category
    expect(category('sk:1')).toBe('attack') // 攻撃
    expect(category('sk:-2096489472')).toBe('affinity') // 見切り
    expect(category('sk:1425756032')).toBe('resistance') // 火耐性
  })

  it('発動条件の一覧が id の昇順で、ja・en の辞書に名前がある（006 受入基準 1）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const ja = await readJson<MasterDictionary>(JA)
    const en = await readJson<MasterDictionary>(EN)
    const ids = bundle.conditions.map((c) => c.id as string)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toEqual([...ids].sort())
    expect(ids).toContain('cd:weak_point')
    expect(ids).toContain('cd:wound')
    expect(ja.entries['cd:weak_point']).toEqual({ name: '有効部位への攻撃' })
    expect(en.entries['cd:weak_point']).toEqual({ name: 'Attacking a weak point' })
    expect(ja.entries['cd:wound']).toEqual({ name: '傷口への攻撃' })
    expect(en.entries['cd:wound']).toEqual({ name: 'Attacking a wound' })
    for (const id of ids) {
      expect(ja.entries[id]?.name, id).toBeTruthy()
      expect(en.entries[id]?.name, id).toBeTruthy()
    }
    // 効果が参照する条件はすべて一覧にあり、一覧の条件はどれかの効果から参照される
    const referenced = new Set(
      bundle.skills.flatMap((s) => s.effectsByLevel.flat().map((e) => e.conditionId)),
    )
    for (const id of ids) expect(referenced.has(id as never), id).toBe(true)
  })

  describe('代表のスキルの全レベルの効果が説明文の数値と一致する（006 受入基準 3）', () => {
    // 数値は ja の levelDescriptions から書き写したもの（実装の写しではない）
    const cases: [string, string, Effect[][]][] = [
      [
        'sk:1',
        '攻撃',
        [
          [{ stat: 'attack_add', value: 3 }],
          [{ stat: 'attack_add', value: 5 }],
          [{ stat: 'attack_add', value: 7 }],
          [
            { stat: 'attack_mul', value: 1.02 },
            { stat: 'attack_add', value: 8 },
          ],
          [
            { stat: 'attack_mul', value: 1.04 },
            { stat: 'attack_add', value: 9 },
          ],
        ],
      ],
      [
        'sk:-2096489472',
        '見切り',
        [4, 8, 12, 16, 20].map((value) => [{ stat: 'affinity_add', value }]),
      ],
      [
        'sk:-1607763456',
        '超会心',
        [1.28, 1.31, 1.34, 1.37, 1.4].map((value) => [{ stat: 'crit_mul', value }]),
      ],
      [
        'sk:-397570464',
        '弱点特効',
        [
          [5, 3],
          [10, 5],
          [15, 10],
          [20, 15],
          [30, 20],
        ].map(([weak, wound]) => [
          { stat: 'affinity_add', value: weak!, conditionId: 'cd:weak_point' },
          { stat: 'affinity_add', value: wound!, conditionId: 'cd:wound' },
        ]),
      ],
      [
        'sk:1865909632',
        '挑戦者',
        [
          [4, 3],
          [8, 5],
          [12, 7],
          [16, 10],
          [20, 15],
        ].map(([attack, affinity]) => [
          { stat: 'attack_add', value: attack!, conditionId: 'cd:agitator' },
          { stat: 'affinity_add', value: affinity!, conditionId: 'cd:agitator' },
        ]),
      ],
    ] as [string, string, Effect[][]][]

    it.each(cases)('%s %s', async (id, name, expected) => {
      const bundle = await readJson<MasterBundle>(BUNDLE)
      const ja = await readJson<MasterDictionary>(JA)
      expect(ja.entries[id]?.name).toBe(name)
      expect(bundle.skills.find((s) => s.id === id)?.effectsByLevel).toEqual(expected)
    })
  })

  it('説明文に攻撃力・会心率・会心倍率の数値があるスキルは、効果を持つか除外の一覧にある（006 受入基準 3）', async () => {
    // 4種の効果で表せない、または数値の無いスキル（スキル ID → 除外の理由）
    const EXCLUDED: Record<string, string> = {
      'sk:1934955136': 'オトモの攻撃力と防御力だけ（オトモは対象外）',
      'sk:1998066176': '攻撃力と防御力が上がるが数値が無い（回数の２回だけ）',
      'sk:24531': '属性攻撃力が上がるだけ（属性は対象外。Q40）',
    }
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const ja = await readJson<MasterDictionary>(JA)
    const mentionsStat = (text: string): boolean =>
      /攻撃力|会心率|会心攻撃時のダメージ倍率/.test(text) && /[0-9０-９]/.test(text)
    const leaked: string[] = []
    const matched = new Set<string>()
    for (const skill of bundle.skills) {
      if (!(ja.entries[skill.id]?.levelDescriptions ?? []).some(mentionsStat)) continue
      matched.add(skill.id)
      if (skill.effectsByLevel.length === 0 && !(skill.id in EXCLUDED)) leaked.push(skill.id)
    }
    expect(leaked).toEqual([])
    // 除外の一覧が古くならないよう、載せたスキルは説明文に該当し、効果を持たないことを確かめる
    for (const id of Object.keys(EXCLUDED)) {
      expect(matched.has(id), `${id} は該当しない`).toBe(true)
      expect(bundle.skills.find((s) => s.id === id)?.effectsByLevel, id).toEqual([])
    }
  })

  describe('属性値・状態異常値・防御力・耐性値の効果が説明文の数値と一致する（037 AC-6）', () => {
    // 数値は ja の levelDescriptions から書き写したもの（実装の写しではない）。加算の属性値・状態異常値は説明文の ÷ 10
    const cases: [string, string, number, Effect[]][] = [
      [
        'sk:-562534336',
        '火属性攻撃強化',
        3,
        [
          { stat: 'element_mul', value: 1.2, element: 'fire' },
          { stat: 'element_add', value: 6, element: 'fire' },
        ],
      ],
      [
        'sk:-1716324608',
        '毒属性強化',
        3,
        [
          { stat: 'status_mul', value: 1.2, element: 'poison' },
          { stat: 'status_add', value: 5, element: 'poison' },
        ],
      ],
      [
        'sk:1077686656',
        '防御',
        7,
        [
          { stat: 'defense_mul', value: 1.1 },
          { stat: 'defense_add', value: 35 },
          { stat: 'resistance_add', value: 5, element: 'all' },
        ],
      ],
      [
        'sk:1425756032',
        '火耐性',
        3,
        [
          { stat: 'resistance_add', value: 20, element: 'fire' },
          { stat: 'defense_add', value: 10 },
        ],
      ],
    ]
    it.each(cases)('%s %s Lv%i', async (id, name, level, expected) => {
      const bundle = await readJson<MasterBundle>(BUNDLE)
      const ja = await readJson<MasterDictionary>(JA)
      expect(ja.entries[id]?.name).toBe(name)
      expect(bundle.skills.find((s) => s.id === id)?.effectsByLevel[level - 1]).toEqual(expected)
    })

    it('対象のスキル 15 件のすべてのレベルが空でない', async () => {
      const targets: [string, string][] = [
        ['sk:-562534336', '火属性攻撃強化'],
        ['sk:508916704', '水属性攻撃強化'],
        ['sk:1452140672', '雷属性攻撃強化'],
        ['sk:1268070400', '氷属性攻撃強化'],
        ['sk:-776946176', '龍属性攻撃強化'],
        ['sk:-1716324608', '毒属性強化'],
        ['sk:-1863702144', '麻痺属性強化'],
        ['sk:166057120', '睡眠属性強化'],
        ['sk:-844978880', '爆破属性強化'],
        ['sk:1077686656', '防御'],
        ['sk:1425756032', '火耐性'],
        ['sk:383104832', '水耐性'],
        ['sk:2143068800', '雷耐性'],
        ['sk:652161472', '氷耐性'],
        ['sk:-2125233152', '龍耐性'],
      ]
      const bundle = await readJson<MasterBundle>(BUNDLE)
      const ja = await readJson<MasterDictionary>(JA)
      for (const [id, name] of targets) {
        const skill = bundle.skills.find((s) => s.id === id)
        expect(ja.entries[id]?.name, id).toBe(name)
        expect(skill?.effectsByLevel.length, id).toBe(skill?.maxLevel)
        for (const [index, effects] of (skill?.effectsByLevel ?? []).entries()) {
          expect(effects.length, `${id} Lv${index + 1}`).toBeGreaterThan(0)
        }
      }
    })

    it('説明文に属性値・状態異常値・防御力・耐性値の数値があるスキルは、効果を持つか除外の一覧にある', async () => {
      const EXCLUDED: Record<string, string> = {
        'sk:-596764096': '砲術: 砲撃に範囲を限る値',
        'sk:1489568384': '属性吸収: 種類の区別が定まらない値（発動時に受けた属性）',
        'sk:1522518528': '防御力ＤＯＷＮ耐性: 効果時間の数値',
        'sk:1934955136': 'オトモへの采配: オトモは対象外',
        'sk:1998066176': '毛皮の昂揚: 数値は回数だけ',
      }
      const bundle = await readJson<MasterBundle>(BUNDLE)
      const ja = await readJson<MasterDictionary>(JA)
      const mentionsStat = (text: string): boolean =>
        /属性攻撃値|属性値|蓄積値|防御力|耐性/.test(text) && /[0-9０-９]/.test(text)
      const leaked: string[] = []
      const matched = new Set<string>()
      for (const skill of bundle.skills) {
        if (!(ja.entries[skill.id]?.levelDescriptions ?? []).some(mentionsStat)) continue
        matched.add(skill.id)
        if (skill.effectsByLevel.length === 0 && !(skill.id in EXCLUDED)) leaked.push(skill.id)
      }
      expect(leaked).toEqual([])
      for (const id of Object.keys(EXCLUDED)) {
        expect(matched.has(id), `${id} は該当しない`).toBe(true)
        expect(bundle.skills.find((s) => s.id === id)?.effectsByLevel, id).toEqual([])
      }
    })
  })

  it('命脈と黙示録の発動部位数がオーバーレイの訂正どおり（9）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    for (const id of ['sb:-1432692352', 'sb:5590']) {
      expect(bundle.setBonuses.find((s) => s.id === id)?.thresholds).toEqual([
        { pieces: 2, level: 1 },
        { pieces: 4, level: 2 },
      ])
    }
  })

  it('抽選テーブルのパターンのレア度が 5〜8 で、1 件以上あり、参照する群がすべて groups にある（036 AC-4）', async () => {
    const { patterns, groups } = (await readJson<MasterBundle>(BUNDLE)).appraisedCharm
    expect(patterns.length).toBeGreaterThan(0)
    const names = new Set(groups.map((g) => g.group))
    for (const pattern of patterns) {
      expect([5, 6, 7, 8], `rarity ${pattern.rarity}`).toContain(pattern.rarity)
      for (const name of pattern.skillGroups) {
        if (name !== null) expect(names.has(name), `群 ${name}`).toBe(true)
      }
    }
  })

  it('群のスキルのレベルが 1 以上かつ最大レベル以下（036 AC-4）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    expect(bundle.appraisedCharm.groups.length).toBeGreaterThan(0)
    for (const group of bundle.appraisedCharm.groups) {
      for (const { skillId, level } of group.skills) {
        const skill = bundle.skills.find((s) => s.id === skillId)
        expect(skill, skillId).toBeDefined()
        expect(level, `${group.group} ${skillId}`).toBeGreaterThanOrEqual(1)
        expect(level, `${group.group} ${skillId}`).toBeLessThanOrEqual(skill?.maxLevel ?? 0)
      }
    }
  })

  it('レア5〜7 のスロットに武器用の枠が無く、レア8 は 1 枠目だけが武器用 Lv1（036 AC-4）', async () => {
    const { patterns } = (await readJson<MasterBundle>(BUNDLE)).appraisedCharm
    for (const pattern of patterns) {
      for (const slots of pattern.slotPatterns) {
        if (pattern.rarity < 8) {
          expect(
            slots.some((s) => s.target === 'weapon'),
            `rarity ${pattern.rarity}`,
          ).toBe(false)
        } else {
          expect(slots[0], 'rarity 8').toEqual({ target: 'weapon', level: 1 })
          expect(slots.slice(1).some((s) => s.target === 'weapon')).toBe(false)
        }
      }
    }
  })

  it('overlay の skillId の行がすべて ja のスキル名のコメントで終わる（036 AC-2）', async () => {
    const text = await readFile(
      `${import.meta.dirname}/../../../overlays/appraised-charm.yaml`,
      'utf8',
    )
    const ja = await readJson<MasterDictionary>(JA)
    const lines = text.split('\n').filter((line) => line.includes('skillId'))
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const match = /skillId: '([^']+)'.*# (.+)$/u.exec(line)
      expect(match, line).not.toBeNull()
      expect(match?.[2], line).toBe(ja.entries[match?.[1] ?? '']?.name)
    }
  })
})

describe('効果の数値（038。コミット済みの dist/ を読む）', () => {
  // AC-6: 代表の値。adopted.md の採用した値から書き写したもの（実装の写しではない）
  describe('代表の値が採用した値と一致する（AC-6）', () => {
    const cases: [string, string, number, unknown[]][] = [
      [
        'sk:31540',
        'オメガレゾナンス',
        1,
        [
          { stat: 'affinity_add', value: 20, conditionId: 'cd:resonance_near' },
          { stat: 'attack_add', value: 10, conditionId: 'cd:resonance_far' },
        ],
      ],
      [
        'sk:31540',
        'オメガレゾナンス',
        2,
        [
          { stat: 'affinity_add', value: 40, conditionId: 'cd:resonance_near' },
          { stat: 'attack_add', value: 20, conditionId: 'cd:resonance_far' },
        ],
      ],
      [
        'sk:7506',
        'シールドオプション',
        1,
        [{ stat: 'defense_add', value: 30, conditionId: 'cd:synthetic_shield' }],
      ],
    ]
    it.each(cases)('%s %s Lv%i', async (id, name, level, expected) => {
      const bundle = await readJson<MasterBundle>(BUNDLE)
      const ja = await readJson<MasterDictionary>(JA)
      expect(ja.entries[id]?.name).toBe(name)
      expect(bundle.skills.find((s) => s.id === id)?.effectsByLevel[level - 1]).toEqual(expected)
    })
  })

  // 対象の候補 29 件（plan D1。ID → ja の名前）
  const CANDIDATES: Record<string, string> = {
    'sk:313598432': '会心撃【属性】',
    'sk:-168922880': '会心撃【特殊】',
    'sk:565867136': '連撃',
    'sk:-1700743296': '災禍転福',
    'sk:1489568384': '属性吸収',
    'sk:2083363072': '属性変換',
    'sk:722735744': '黒蝕竜の力',
    'sk:-215826112': '凍峰竜の反逆',
    'sk:30992': '千刃竜の闘志',
    'sk:1998066176': '毛皮の昂揚',
    'sk:2107855744': 'ヌシの憤激',
    'sk:1484575872': 'ヌシの魂',
    'sk:-1769550080': 'ヌシの誇り',
    'sk:-911441792': '花舞の祈り',
    'sk:11709': '夢灯の祈り',
    'sk:30815': '祝謡の祈り',
    'sk:8694': '踊火の祈り',
    'sk:2104075392': '波衣竜の守護',
    'sk:451472896': '革細工の滑性',
    'sk:741102208': '雪獅子の闘志',
    'sk:5590': '巨戟龍の黙示録',
    'sk:24531': '暗黒騎士の証',
    'sk:16835': '海竜の渦雷',
    'sk:31540': 'オメガレゾナンス',
    'sk:1639440000': '研鑽',
    'sk:28385': 'パワーストーン',
    'sk:3813': '暗黒',
    'sk:31998': '連携プログラム',
    'sk:7506': 'シールドオプション',
  }

  // 空のまま: 値が出典で定まらない・武器種で違う（Q196）など
  const KEPT_EMPTY: Record<string, string> = {
    'sk:-168922880': '値を載せる出典が K のみ・読みが定まらない',
    'sk:1489568384': '値を載せる出典が K のみ・読みが定まらない',
    'sk:2083363072': '値を載せる出典が K のみ・読みが定まらない',
    'sk:722735744': '値を載せる出典が K のみ・読みが定まらない',
    'sk:-215826112': '値を載せる出典が K のみ・読みが定まらない',
    'sk:30992': '値を載せる出典が K のみ・読みが定まらない',
    'sk:1998066176': '値を載せる出典が K のみ・読みが定まらない',
    'sk:2107855744': '値を載せる出典が K のみ・読みが定まらない',
    'sk:1484575872': '値を載せる出典が K のみ・読みが定まらない',
    'sk:-1769550080': '値を載せる出典が K のみ・自分に効くかが定まらない',
    'sk:-911441792': '値を載せる出典が K のみ・読みが定まらない',
    'sk:11709': '値を載せる出典が K のみ・読みが定まらない',
    'sk:30815': '値を載せる出典が無い（K のページを取得できず）',
    'sk:8694': '値を載せる出典が K のみ・読みが定まらない',
    'sk:2104075392': '値を載せる出典が K のみ・読みが定まらない',
    'sk:451472896': '値を載せる出典が K のみ・読みが定まらない',
    'sk:741102208': '値を載せる出典が K のみ・仲間に効く',
    'sk:5590': '値を載せる出典が無い（K のページを取得できず）',
    'sk:24531': '全属性への乗算の書式が無く読みが定まらない',
    'sk:16835': '値を載せる出典が K のみ・読みが定まらない',
    'sk:1639440000': '値を載せる出典が G8e のみ',
    'sk:28385': '値を載せる出典が無い',
    'sk:3813': '値を載せる出典が G8e のみ',
    'sk:31998': '出典が食い違う（G8e 会心率 +15%、K 30/40）',
  }

  it('対象の候補は、全レベルが効果を持つか、理由つきの「空のまま」の一覧にある（AC-1・AC-6）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const ja = await readJson<MasterDictionary>(JA)
    expect(Object.keys(CANDIDATES)).toHaveLength(29)
    // 武器種で値が違う 3 件は 043 の describe で確かめる（値の定まらないレベルを空にしうるため、全レベルが空でないことを求める本テストから外す）
    const MOVED_TO_043 = ['sk:313598432', 'sk:565867136', 'sk:-1700743296']
    for (const id of MOVED_TO_043) expect(id in CANDIDATES, id).toBe(true)
    const bad: string[] = []
    for (const [id, name] of Object.entries(CANDIDATES)) {
      if (MOVED_TO_043.includes(id)) continue
      expect(ja.entries[id]?.name, id).toBe(name)
      const effects = bundle.skills.find((s) => s.id === id)?.effectsByLevel ?? []
      const hasValues = effects.length > 0 && effects.every((level) => level.length > 0)
      const keptEmpty = effects.every((level) => level.length === 0)
      const listed = id in KEPT_EMPTY
      // 効果を持つなら一覧に無く、空のままなら理由つきで一覧にある（どちらか一方）
      if (!(hasValues !== listed && (hasValues || keptEmpty))) bad.push(`${id} ${name}`)
    }
    expect(bad).toEqual([])
    for (const id of Object.keys(KEPT_EMPTY)) expect(id in CANDIDATES, id).toBe(true)
    expect(Object.values(KEPT_EMPTY).every((reason) => reason.length > 0)).toBe(true)
  })

  it('対象外の 15 件は効果を持たない（AC-2。Q195）', async () => {
    const OUT_OF_SCOPE: Record<string, string> = {
      'sk:-1475134080': 'チャージマスター',
      'sk:1613139840': 'フォースショット',
      'sk:-1961297152': '通常弾・通常矢強化',
      'sk:-2123993856': '散弾・剛射強化',
      'sk:552982656': '貫通弾・竜の矢強化',
      'sk:-596764096': '砲術',
      'sk:1826': '焼き砲モロコシ',
      'sk:10503': 'にぎりめし',
      'sk:-856322816': '鎖刃刺撃',
      'sk:-3666104': '火竜の力',
      'sk:576193792': '白熾の奔流',
      'sk:1934955136': 'オトモへの采配',
      'sk:-2041451904': '護竜の守り',
      'sk:11481': '耐性変換【水】',
      'sk:30201': '耐性変換【雷】',
    }
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const ja = await readJson<MasterDictionary>(JA)
    expect(Object.keys(OUT_OF_SCOPE)).toHaveLength(15)
    for (const [id, name] of Object.entries(OUT_OF_SCOPE)) {
      expect(ja.entries[id]?.name, id).toBe(name)
      const effects = bundle.skills.find((s) => s.id === id)?.effectsByLevel ?? []
      expect(
        effects.every((level) => level.length === 0),
        id,
      ).toBe(true)
    }
  })

  it('Web 由来の値を持つスキルの行だけが「（Web）」のコメントで終わる（AC-4）', async () => {
    const text = await readFile(`${import.meta.dirname}/../../../overlays/effects.yaml`, 'utf8')
    const ja = await readJson<MasterDictionary>(JA)
    const skillLines = text.split('\n').filter((line) => /^ {2}sk:\S+: # /.test(line))
    expect(skillLines.length).toBeGreaterThan(0)
    const webIds = ['sk:31540', 'sk:7506', 'sk:313598432', 'sk:-1700743296', 'sk:565867136']
    for (const line of skillLines) {
      const id = /^ {2}(sk:\S+):/.exec(line)?.[1] ?? ''
      if (webIds.includes(id)) {
        expect(line.endsWith(`# ${ja.entries[id]?.name}（Web）`), line).toBe(true)
      } else {
        expect(line.includes('（Web）'), line).toBe(false)
      }
    }
    for (const id of webIds)
      expect(
        skillLines.some((l) => l.startsWith(`  ${id}:`)),
        id,
      ).toBe(true)
  })
})

describe('武器種で値が違う効果（043。コミット済みの dist/ を読む）', () => {
  // adopted.md の採用した値から書き写したもの（実装の写しではない）
  const HEAVY = ['great-sword', 'hammer', 'hunting-horn', 'gunlance', 'switch-axe', 'charge-blade']
  const LIGHT = [
    'long-sword',
    'sword-shield',
    'dual-blades',
    'lance',
    'insect-glaive',
    'light-bowgun',
    'heavy-bowgun',
    'bow',
  ]
  const BURST_C = [
    'long-sword',
    'sword-shield',
    'hammer',
    'lance',
    'gunlance',
    'switch-axe',
    'charge-blade',
    'insect-glaive',
  ]
  const burst = (
    stat: 'attack_add' | 'element_add',
    value: number,
    weaponTypes: string[],
  ): Effect => ({ stat, value, conditionId: 'cd:burst_5_hits' as never, weaponTypes })
  const coalescence = (
    stat: 'element_mul' | 'status_mul',
    value: number,
    w?: string[],
  ): Effect => ({
    stat,
    value,
    conditionId: 'cd:coalescence' as never,
    ...(w ? { weaponTypes: w } : {}),
  })

  // 対象の 3 件（ID → ja の名前、最大 Lv）
  const TARGETS: Record<string, [string, number]> = {
    'sk:313598432': ['会心撃【属性】', 3],
    'sk:-1700743296': ['災禍転福', 3],
    'sk:565867136': ['連撃', 5],
  }
  // 「空のまま」の一覧（ID → 理由）。採用した値では全レベルに効果があるので空
  const KEPT_EMPTY: Record<string, string> = {}
  // 空のレベル（スキル ID・Lv・理由）。会心撃【属性】の Lv1・Lv2 の重い武器種は出典が「約」の値だけなので、その組だけを書かない
  // （レベル自体は軽い武器種の効果を持つので、空のレベルは無い）
  const EMPTY_LEVELS: [string, number, string][] = []

  it('対象の 3 件は、効果を持つか、理由つきの「空のまま」の一覧にある（AC-5）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const ja = await readJson<MasterDictionary>(JA)
    for (const [id, [name, maxLevel]] of Object.entries(TARGETS)) {
      expect(ja.entries[id]?.name, id).toBe(name)
      const effects = bundle.skills.find((s) => s.id === id)?.effectsByLevel ?? []
      if (id in KEPT_EMPTY) {
        expect(effects, id).toEqual([])
        expect(KEPT_EMPTY[id]?.length, id).toBeGreaterThan(0)
      } else {
        expect(effects, id).toHaveLength(maxLevel)
        effects.forEach((level, index) => {
          const listed = EMPTY_LEVELS.some(([s, lv]) => s === id && lv === index + 1)
          expect(level.length === 0, `${id} Lv${index + 1}`).toBe(listed)
        })
      }
    }
  })

  it('会心撃【属性】Lv3 は 2 つの武器種の組（AC-5）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const levels = bundle.skills.find((s) => s.id === 'sk:313598432')?.effectsByLevel
    expect(levels?.[2]).toEqual([
      { stat: 'element_crit_mul', value: 1.2, weaponTypes: HEAVY },
      { stat: 'element_crit_mul', value: 1.15, weaponTypes: LIGHT },
    ])
    // Lv1・Lv2 の重い武器種は出典が「約」の値だけなので書かない
    expect(levels?.[0]).toEqual([{ stat: 'element_crit_mul', value: 1.05, weaponTypes: LIGHT }])
    expect(levels?.[1]).toEqual([{ stat: 'element_crit_mul', value: 1.1, weaponTypes: LIGHT }])
  })

  it('災禍転福 Lv3 は条件 cd:coalescence の element_mul 2 つと status_mul（AC-5）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const levels = bundle.skills.find((s) => s.id === 'sk:-1700743296')?.effectsByLevel
    expect(levels?.[2]).toEqual([
      coalescence('element_mul', 1.3, HEAVY),
      coalescence('element_mul', 1.15, LIGHT),
      coalescence('status_mul', 1.15),
    ])
    expect(levels?.[0]?.at(-1)).toEqual(coalescence('status_mul', 1.05))
  })

  it('連撃 Lv5 は条件 cd:burst_5_hits の A〜E の効果（AC-5）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const levels = bundle.skills.find((s) => s.id === 'sk:565867136')?.effectsByLevel
    expect(levels?.[4]).toEqual([
      burst('attack_add', 18, ['great-sword', 'hunting-horn']),
      burst('element_add', 2, ['great-sword', 'hunting-horn']),
      burst('attack_add', 18, ['dual-blades']),
      burst('element_add', 1.2, ['dual-blades']),
      burst('attack_add', 18, BURST_C),
      burst('element_add', 1.4, BURST_C),
      burst('attack_add', 10, ['light-bowgun', 'heavy-bowgun']),
      burst('attack_add', 10, ['bow']),
      burst('element_add', 1.2, ['bow']),
    ])
    expect(levels?.[0]?.[0]).toEqual(burst('attack_add', 10, ['great-sword', 'hunting-horn']))
  })

  it('weaponTypes の要素は実際の武器の武器種で、対象の 3 件の外の効果は weaponTypes を持たない（AC-1・AC-4）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const known = new Set(bundle.weapons.map((w) => w.weaponType))
    for (const skill of bundle.skills) {
      for (const effect of skill.effectsByLevel.flat()) {
        if (!(skill.id in TARGETS)) {
          expect('weaponTypes' in effect, skill.id).toBe(false)
          continue
        }
        const types = effect.weaponTypes ?? []
        expect(
          types.every((t) => known.has(t)),
          skill.id,
        ).toBe(true)
      }
    }
  })

  it('採用で参照された新しい条件だけが conditions にあり、ja・en の名前が一致する（AC-3）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    const ja = await readJson<MasterDictionary>(JA)
    const en = await readJson<MasterDictionary>(EN)
    const NEW = {
      'cd:burst_5_hits': ['連撃の5回継続以降', 'Burst after 5 hits'],
      'cd:coalescence': ['災禍転福の発動中', 'Coalescence active'],
    }
    const ids = new Set(bundle.conditions.map((c) => c.id as string))
    const referenced = new Set(
      bundle.skills.flatMap((s) => s.effectsByLevel.flat()).flatMap((e) => e.conditionId ?? []),
    )
    for (const [id, [jaName, enName]] of Object.entries(NEW)) {
      expect(ids.has(id), id).toBe(true)
      expect(referenced.has(id as never), id).toBe(true)
      expect(ja.entries[id]?.name, id).toBe(jaName)
      expect(en.entries[id]?.name, id).toBe(enName)
    }
  })
})

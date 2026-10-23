import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Effect, MasterBundle, MasterDictionary } from '../../main/index.ts'
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

  it('全防具に rank があり、版が 2026.10.4 である（12。006 受入基準 3）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    expect(bundle.version).toBe('2026.10.4')
    expect(MASTER_VERSION).toBe('2026.10.4')
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
      'sk:565867136': '攻撃力と属性攻撃値がわずかに上昇するが数値が無い（回数の５回だけ）',
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

  it('命脈と黙示録の発動部位数がオーバーレイの訂正どおり（9）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    for (const id of ['sb:-1432692352', 'sb:5590']) {
      expect(bundle.setBonuses.find((s) => s.id === id)?.thresholds).toEqual([
        { pieces: 2, level: 1 },
        { pieces: 4, level: 2 },
      ])
    }
  })
})

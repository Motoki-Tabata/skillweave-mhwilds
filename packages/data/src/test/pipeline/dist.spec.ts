import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { MasterBundle, MasterDictionary } from '../../main/index.ts'
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

  it('全防具に rank があり、版が 2026.10.3 である（12）', async () => {
    const bundle = await readJson<MasterBundle>(BUNDLE)
    expect(bundle.version).toBe('2026.10.3')
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

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MASTER_VERSION, MHDB_COMMIT, MHDB_REPOSITORY } from '../../main/pipeline/config.ts'
import type { FetchFn } from '../../main/pipeline/fetch.ts'
import { run } from '../../main/pipeline/generate.ts'
import { makeInput, useTempDirs } from '../support/fixtures.ts'

const makeTempDir = useTempDirs()
const quiet = (): void => undefined

/** 手で書いた入力を、MHDB の URL の末尾のファイル名で返す fetch */
function fakeFetch(calls: string[] = []): FetchFn {
  const input = makeInput()
  const byFile: Record<string, unknown> = {
    'Skill.json': input.skills,
    'Armor.json': input.armors,
    'Accessory.json': input.accessories,
    'Amulet.json': input.amulets,
    'Bow.json': input.weapons,
  }
  return (url) => {
    calls.push(url)
    const data = byFile[url.slice(url.lastIndexOf('/') + 1)] ?? []
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(data)),
    })
  }
}

async function packageDir(): Promise<string> {
  return `${await makeTempDir()}/`
}

const generate = (dir: string, check: boolean, calls: string[] = []): Promise<void> =>
  run({ check, fetchFn: fakeFetch(calls), packageDir: dir, log: quiet })

const bundlePath = (dir: string): string => join(dir, 'dist', `master-${MASTER_VERSION}.json`)

describe('生成の入口（受入基準 1・2・10）', () => {
  it('取得→変換→検証→出力を順に行い、設定の版の3ファイルを書く', async () => {
    const dir = await packageDir()
    const calls: string[] = []
    const logs: string[] = []
    await run({
      check: false,
      fetchFn: fakeFetch(calls),
      packageDir: dir,
      log: (m) => logs.push(m),
    })
    expect(calls).toHaveLength(18)
    expect(calls[0]).toContain(`${MHDB_REPOSITORY}/${MHDB_COMMIT}/`)
    expect((await readdir(join(dir, 'dist'))).sort()).toEqual([
      `master-${MASTER_VERSION}.en.json`,
      `master-${MASTER_VERSION}.ja.json`,
      `master-${MASTER_VERSION}.json`,
    ])
    expect(logs.join('\n')).toContain('検証の違反: 0件')
    const bundle = JSON.parse(await readFile(bundlePath(dir), 'utf8')) as {
      source: { commit: string }
    }
    expect(bundle.source.commit).toBe(MHDB_COMMIT)
  })

  it('2回目はキャッシュを使ってネットワークに接続せず、同じ内容になる', async () => {
    const dir = await packageDir()
    await generate(dir, false)
    const before = await readFile(bundlePath(dir), 'utf8')
    const calls: string[] = []
    await generate(dir, false, calls)
    expect(calls).toEqual([])
    expect(await readFile(bundlePath(dir), 'utf8')).toBe(before)
  })

  it('--check は dist/ を書かず、一致していれば成功し、違えば違うファイルを示して失敗する', async () => {
    const dir = await packageDir()
    await expect(generate(dir, true)).rejects.toThrow(/master-.*\.json（存在しません）/)
    await expect(readdir(join(dir, 'dist'))).rejects.toThrow()

    await generate(dir, false)
    await generate(dir, true)
    await writeFile(join(dir, 'dist', `master-${MASTER_VERSION}.ja.json`), 'edited')
    await expect(generate(dir, true)).rejects.toThrow(/master-.*\.ja\.json（内容が異なります）/)
  })

  it('オーバーレイのエラーは出力を書かずに失敗する', async () => {
    const dir = await packageDir()
    await mkdir(join(dir, 'overlays'))
    await writeFile(join(dir, 'overlays', 'bad.yaml'), 'unknown: 1\n')
    await expect(generate(dir, false)).rejects.toThrow(
      /オーバーレイのエラー（1件）[\s\S]*bad\.yaml:1:1/,
    )
    await expect(readdir(join(dir, 'dist'))).rejects.toThrow()
  })

  it('検証の違反は全件を示し、出力を書かずに失敗する', async () => {
    const dir = await packageDir()
    await mkdir(join(dir, 'overlays'))
    await writeFile(
      join(dir, 'overlays', 'a.yaml'),
      'replace:\n  - id: sb:200\n    field: thresholds\n    value:\n      - { pieces: 4, level: 1 }\n      - { pieces: 2, level: 1 }\n',
    )
    await expect(generate(dir, false)).rejects.toThrow(/検証の違反（1件）[\s\S]*threshold-order/)
    await expect(readdir(join(dir, 'dist'))).rejects.toThrow()
  })
})

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MHDB_FILES, fetchMhdb, mhdbUrl, type FetchFn } from '../../main/pipeline/fetch.ts'
import { useTempDirs } from '../support/fixtures.ts'

const makeTempDir = useTempDirs()
const REPO = 'owner/repo'
const SHA = 'deadbeef'

function okFetch(calls: string[]): FetchFn {
  return (url) => {
    calls.push(url)
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') })
  }
}

describe('取得とキャッシュ（受入基準 2）', () => {
  it('取得対象は18ファイルで、URL は raw.githubusercontent.com の固定 SHA', () => {
    expect(MHDB_FILES).toHaveLength(18)
    expect(mhdbUrl(REPO, SHA, MHDB_FILES[0]!)).toBe(
      `https://raw.githubusercontent.com/owner/repo/deadbeef/output/merged/Skill.json`,
    )
  })

  it('キャッシュが無ければ18件を取得して置き、MHDB の入力にまとめる', async () => {
    const cacheRoot = await makeTempDir()
    const calls: string[] = []
    const input = await fetchMhdb({
      repository: REPO,
      commit: SHA,
      cacheRoot,
      fetchFn: okFetch(calls),
    })
    expect(calls).toHaveLength(18)
    expect(input).toEqual({ skills: [], armors: [], accessories: [], amulets: [], weapons: [] })
    expect(await readFile(join(cacheRoot, SHA, 'output/merged/Skill.json'), 'utf8')).toBe('[]')
    expect(await readdir(join(cacheRoot, SHA, 'output/merged/weapons'))).toHaveLength(14)
  })

  it('同じ SHA のキャッシュが揃っていれば fetch を呼ばない', async () => {
    const cacheRoot = await makeTempDir()
    await fetchMhdb({ repository: REPO, commit: SHA, cacheRoot, fetchFn: okFetch([]) })
    const calls: string[] = []
    await fetchMhdb({ repository: REPO, commit: SHA, cacheRoot, fetchFn: okFetch(calls) })
    expect(calls).toEqual([])
  })

  it('足りないファイルだけを取得する', async () => {
    const cacheRoot = await makeTempDir()
    for (const path of MHDB_FILES.slice(1)) {
      await mkdir(dirname(join(cacheRoot, SHA, path)), { recursive: true })
      await writeFile(join(cacheRoot, SHA, path), '[]')
    }
    const calls: string[] = []
    await fetchMhdb({ repository: REPO, commit: SHA, cacheRoot, fetchFn: okFetch(calls) })
    expect(calls).toEqual([mhdbUrl(REPO, SHA, MHDB_FILES[0]!)])
  })

  it('別の SHA のキャッシュは使わない', async () => {
    const cacheRoot = await makeTempDir()
    await fetchMhdb({ repository: REPO, commit: SHA, cacheRoot, fetchFn: okFetch([]) })
    const calls: string[] = []
    await fetchMhdb({ repository: REPO, commit: 'other', cacheRoot, fetchFn: okFetch(calls) })
    expect(calls).toHaveLength(18)
  })

  it('HTTP エラーは URL とステータスを示して失敗し、キャッシュに置かない', async () => {
    const cacheRoot = await makeTempDir()
    const fetchFn: FetchFn = () =>
      Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
    await expect(fetchMhdb({ repository: REPO, commit: SHA, cacheRoot, fetchFn })).rejects.toThrow(
      /https:\/\/raw\.githubusercontent\.com\/owner\/repo\/deadbeef\/output\/merged\/Skill\.json.*404/,
    )
    await expect(readdir(join(cacheRoot, SHA))).rejects.toThrow()
  })

  it('接続の失敗も URL を示して失敗する', async () => {
    const cacheRoot = await makeTempDir()
    const fetchFn: FetchFn = () => Promise.reject(new Error('offline'))
    await expect(fetchMhdb({ repository: REPO, commit: SHA, cacheRoot, fetchFn })).rejects.toThrow(
      /Skill\.json.*offline/,
    )
  })

  it('JSON として解釈できないキャッシュはファイルを示して失敗する', async () => {
    const cacheRoot = await makeTempDir()
    const fetchFn: FetchFn = () =>
      Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{broken') })
    await expect(fetchMhdb({ repository: REPO, commit: SHA, cacheRoot, fetchFn })).rejects.toThrow(
      /JSON として解釈できません: output\/merged\/Skill\.json/,
    )
  })
})

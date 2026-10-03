import { mkdir, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffOutput, outputContents, writeOutput } from '../../main/pipeline/output.ts'
import { useTempDirs } from '../support/fixtures.ts'

const makeTempDir = useTempDirs()
const contents = (version: string, tag = 'x') =>
  outputContents(version, { bundle: `${tag}-b\n`, ja: `${tag}-j\n`, en: `${tag}-e\n` })

describe('出力（受入基準 10・11・12）', () => {
  it('3つのファイル名を版から作る', () => {
    expect([...contents('1.0.0').keys()]).toEqual([
      'master-1.0.0.json',
      'master-1.0.0.ja.json',
      'master-1.0.0.en.json',
    ])
  })

  it('新しい版を書き、旧版の master-*.json を削除して他のファイルは触らない（12）', async () => {
    const dist = join(await makeTempDir(), 'dist')
    await mkdir(dist)
    await writeFile(join(dist, 'master-0.9.json'), 'old')
    await writeFile(join(dist, 'master-0.9.ja.json'), 'old')
    await writeFile(join(dist, '.gitkeep'), '')
    const result = await writeOutput(dist, contents('1.0.0'))
    expect(result.written).toHaveLength(3)
    expect(result.removed.sort()).toEqual(['master-0.9.ja.json', 'master-0.9.json'])
    expect((await readdir(dist)).sort()).toEqual([
      '.gitkeep',
      'master-1.0.0.en.json',
      'master-1.0.0.ja.json',
      'master-1.0.0.json',
    ])
    expect(await readFile(join(dist, 'master-1.0.0.json'), 'utf8')).toBe('x-b\n')
  })

  it('dist/ が無くても作って書く', async () => {
    const dist = join(await makeTempDir(), 'new', 'dist')
    await mkdir(join(dist, '..'))
    const result = await writeOutput(dist, contents('1.0.0'))
    expect(result.written).toHaveLength(3)
  })

  it('同じ版で中身が異なれば版を上げるよう示して失敗し、何も書かない・上書きしない（11）', async () => {
    const dist = await makeTempDir()
    await writeFile(join(dist, 'master-1.0.0.json'), 'existing')
    await writeFile(join(dist, 'master-0.9.json'), 'old')
    await expect(writeOutput(dist, contents('1.0.0'))).rejects.toThrow(
      /master-1\.0\.0\.json.*版.*上げ/,
    )
    expect(await readFile(join(dist, 'master-1.0.0.json'), 'utf8')).toBe('existing')
    expect((await readdir(dist)).sort()).toEqual(['master-0.9.json', 'master-1.0.0.json'])
  })

  it('同じなら書き換えない（10）', async () => {
    const dist = await makeTempDir()
    await writeOutput(dist, contents('1.0.0'))
    const target = join(dist, 'master-1.0.0.json')
    const past = new Date('2020-01-01T00:00:00Z')
    await utimes(target, past, past)
    const result = await writeOutput(dist, contents('1.0.0'))
    expect(result.written).toEqual([])
    expect(result.removed).toEqual([])
    expect((await stat(target)).mtime.getTime()).toBe(past.getTime())
  })

  it('一部のファイルだけが無いときは、無いものだけを書く', async () => {
    const dist = await makeTempDir()
    await writeFile(join(dist, 'master-1.0.0.json'), 'x-b\n')
    const result = await writeOutput(dist, contents('1.0.0'))
    expect(result.written).toEqual(['master-1.0.0.ja.json', 'master-1.0.0.en.json'])
  })

  it('diffOutput は無いファイルと違うファイルを区別する', async () => {
    const dist = await makeTempDir()
    await writeFile(join(dist, 'master-1.0.0.json'), 'x-b\n')
    await writeFile(join(dist, 'master-1.0.0.ja.json'), 'different')
    expect(await diffOutput(dist, contents('1.0.0'))).toEqual([
      { name: 'master-1.0.0.ja.json', state: 'different' },
      { name: 'master-1.0.0.en.json', state: 'missing' },
    ])
  })
})

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface OutputFiles {
  /** `master-<版>.json` */
  bundle: string
  /** `master-<版>.ja.json` */
  ja: string
  /** `master-<版>.en.json` */
  en: string
}

/** 出力するファイル名（ファイル名 → 内容） */
export function outputContents(version: string, files: OutputFiles): Map<string, string> {
  return new Map([
    [`master-${version}.json`, files.bundle],
    [`master-${version}.ja.json`, files.ja],
    [`master-${version}.en.json`, files.en],
  ])
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** 既存のファイルと内容が違うもの（無いものは `missing`）。バイト単位の比較は UTF-8 の文字列の一致で行う */
export async function diffOutput(
  distDir: string,
  contents: Map<string, string>,
): Promise<{ name: string; state: 'missing' | 'different' }[]> {
  const result: { name: string; state: 'missing' | 'different' }[] = []
  for (const [name, content] of contents) {
    const existing = await readIfExists(join(distDir, name))
    if (existing === undefined) result.push({ name, state: 'missing' })
    else if (existing !== content) result.push({ name, state: 'different' })
  }
  return result
}

async function writeAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

/**
 * `dist/` に書く。既にある版のファイルの中身が1つでも違えば、版を上げるよう示して失敗し、何も書かない。
 * 書いた後（または同じだったとき）に、現行の版でない `master-*.json` を削除する。
 */
export async function writeOutput(
  distDir: string,
  contents: Map<string, string>,
): Promise<{ written: string[]; removed: string[] }> {
  const different: string[] = []
  for (const [name, content] of contents) {
    const existing = await readIfExists(join(distDir, name))
    if (existing !== undefined && existing !== content) different.push(name)
  }
  if (different.length > 0) {
    throw new Error(
      `既存のファイルと中身が異なります: ${different.join(', ')}。版（config.ts の MASTER_VERSION）を上げてください`,
    )
  }

  await mkdir(distDir, { recursive: true })
  const written: string[] = []
  for (const [name, content] of contents) {
    if ((await readIfExists(join(distDir, name))) === undefined) {
      await writeAtomic(join(distDir, name), content)
      written.push(name)
    }
  }

  const removed: string[] = []
  for (const name of await readdir(distDir)) {
    if (/^master-.*\.json$/.test(name) && !contents.has(name)) {
      await rm(join(distDir, name))
      removed.push(name)
    }
  }
  return { written, removed }
}

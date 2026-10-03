import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { MhdbInput } from './mhdb.ts'

/** 取得する武器種のファイル（`output/merged/weapons/` の14種。HuntingHorn の旋律・音波などは対象外） */
const WEAPON_FILES = [
  'Bow',
  'ChargeBlade',
  'DualBlades',
  'GreatSword',
  'Gunlance',
  'Hammer',
  'HeavyBowgun',
  'HuntingHorn',
  'InsectGlaive',
  'Lance',
  'LightBowgun',
  'LongSword',
  'SwitchAxe',
  'SwordShield',
].map((name) => `output/merged/weapons/${name}.json`)

/** 取得する18ファイルの、リポジトリ内の相対パス */
export const MHDB_FILES: readonly string[] = [
  'output/merged/Skill.json',
  'output/merged/Armor.json',
  'output/merged/Accessory.json',
  'output/merged/Amulet.json',
  ...WEAPON_FILES,
]

export type FetchFn = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

export interface FetchOptions {
  repository: string
  commit: string
  /** キャッシュの置き場（`.cache/mhdb`）。この下に `<SHA>/<相対パス>` で置く */
  cacheRoot: string
  fetchFn: FetchFn
}

export function mhdbUrl(repository: string, commit: string, path: string): string {
  return `https://raw.githubusercontent.com/${repository}/${commit}/${path}`
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** 一時ファイルに書いてから rename する。途中で落ちたファイルをキャッシュと見なさないため */
async function writeAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
}

async function loadFile(options: FetchOptions, cacheDir: string, path: string): Promise<string> {
  const cachePath = join(cacheDir, path)
  if (await exists(cachePath)) {
    return readFile(cachePath, 'utf8')
  }
  const url = mhdbUrl(options.repository, options.commit, path)
  let response
  try {
    response = await options.fetchFn(url)
  } catch (error) {
    throw new Error(
      `取得に失敗しました: ${url}（${error instanceof Error ? error.message : String(error)}）`,
      {
        cause: error,
      },
    )
  }
  if (!response.ok) {
    throw new Error(`取得に失敗しました: ${url}（HTTP ${response.status}）`)
  }
  const text = await response.text()
  await writeAtomic(cachePath, text)
  return text
}

/** MHDB の18ファイルを取得する（キャッシュにあればネットワークに接続しない）。 */
export async function fetchMhdb(options: FetchOptions): Promise<MhdbInput> {
  const cacheDir = join(options.cacheRoot, options.commit)
  const texts = new Map<string, string>()
  for (const path of MHDB_FILES) {
    texts.set(path, await loadFile(options, cacheDir, path))
  }
  const parse = <T>(path: string): T => {
    const text = texts.get(path) ?? ''
    try {
      return JSON.parse(text) as T
    } catch (error) {
      throw new Error(
        `JSON として解釈できません: ${path}（${error instanceof Error ? error.message : String(error)}）`,
        {
          cause: error,
        },
      )
    }
  }
  return {
    skills: parse('output/merged/Skill.json'),
    armors: parse('output/merged/Armor.json'),
    accessories: parse('output/merged/Accessory.json'),
    amulets: parse('output/merged/Amulet.json'),
    weapons: WEAPON_FILES.flatMap((path) => parse<MhdbInput['weapons']>(path)),
  }
}

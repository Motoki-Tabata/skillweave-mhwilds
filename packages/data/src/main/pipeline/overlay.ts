import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LineCounter, isMap, isSeq, parseDocument } from 'yaml'
import type { Node, YAMLMap } from 'yaml'
import type { MasterBundle } from '../index.ts'
import type { SetBonusMismatch } from './convert.ts'
import { compareCodeUnits } from './sort.ts'

export interface OverlayFile {
  name: string
  text: string
}

export interface OverlayError {
  file: string
  line: number
  col: number
  message: string
}

export type OverlayResult =
  | { ok: true; bundle: MasterBundle; mismatches: SetBonusMismatch[] }
  | { ok: false; errors: OverlayError[] }

type Collection = Exclude<keyof MasterBundle, 'version' | 'source' | 'appraisedCharm'>

/** ID の接頭辞が決める集合 */
const COLLECTIONS: Record<string, Collection> = {
  sk: 'skills',
  sb: 'setBonuses',
  ar: 'armors',
  dc: 'decorations',
  wp: 'weapons',
  ch: 'charms',
}

interface Replacement {
  file: string
  line: number
  col: number
  id: string
  field: string
  value: unknown
}

/** `overlays/*.yaml` を、ファイル名の昇順で読む */
export async function readOverlayFiles(dir: string): Promise<OverlayFile[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const yamlNames = names.filter((name) => name.endsWith('.yaml')).sort(compareCodeUnits)
  return Promise.all(
    yamlNames.map(async (name) => ({ name, text: await readFile(join(dir, name), 'utf8') })),
  )
}

function keyName(key: unknown): string {
  const value = (key as { value?: unknown } | null)?.value
  return typeof value === 'string' ? value : JSON.stringify(value)
}

interface Parsed {
  replacements: Replacement[]
  appraisedCharm?: {
    file: string
    line: number
    col: number
    value: MasterBundle['appraisedCharm']
  }
}

function parseFile(file: OverlayFile, errors: OverlayError[], parsed: Parsed): void {
  const lineCounter = new LineCounter()
  const doc = parseDocument(file.text, { lineCounter })
  const at = (node: Node | null | undefined): { line: number; col: number } => {
    const offset = node?.range?.[0] ?? 0
    return lineCounter.linePos(offset)
  }
  const fail = (node: Node | null | undefined, message: string): void => {
    errors.push({ file: file.name, ...at(node), message })
  }

  if (doc.errors.length > 0) {
    for (const error of doc.errors) {
      const start = error.linePos?.[0] ?? { line: 1, col: 1 }
      errors.push({ file: file.name, line: start.line, col: start.col, message: error.message })
    }
    return
  }
  const root = doc.contents
  if (root === null) return // 空のファイル
  if (!isMap(root)) {
    fail(root, '最上位はキーと値の組（replace・appraisedCharm）でなければなりません')
    return
  }
  for (const pair of root.items) {
    const key = keyName(pair.key)
    if (key === 'replace') {
      parseReplace(pair.value as Node | null, file.name, at, fail, parsed)
    } else if (key === 'appraisedCharm') {
      parseAppraisedCharm(pair.value as Node | null, file.name, at, fail, parsed)
    } else {
      fail(pair.key as Node, `未知のキー ${key} です（replace・appraisedCharm だけを許します）`)
    }
  }
}

type At = (node: Node | null | undefined) => { line: number; col: number }
type Fail = (node: Node | null | undefined, message: string) => void

function parseReplace(node: Node | null, file: string, at: At, fail: Fail, parsed: Parsed): void {
  if (!isSeq(node)) {
    fail(node, 'replace は配列でなければなりません')
    return
  }
  for (const item of node.items) {
    if (!isMap(item)) {
      fail(item as Node, 'replace の要素はキーと値の組でなければなりません')
      continue
    }
    const missing = ['id', 'field', 'value'].filter((key) => !item.has(key))
    if (missing.length > 0) {
      fail(item, `replace の要素に ${missing.join('・')} がありません`)
      continue
    }
    const id = (item as YAMLMap).get('id')
    const field = (item as YAMLMap).get('field')
    if (typeof id !== 'string' || typeof field !== 'string') {
      fail(item, 'id と field は文字列でなければなりません')
      continue
    }
    const valueNode = item.get('value', true) as { toJSON?: () => unknown } | null
    const value = valueNode && typeof valueNode.toJSON === 'function' ? valueNode.toJSON() : null
    parsed.replacements.push({ file, ...at(item), id, field, value })
  }
}

function parseAppraisedCharm(
  node: Node | null,
  file: string,
  at: At,
  fail: Fail,
  parsed: Parsed,
): void {
  if (!isMap(node)) {
    fail(node, 'appraisedCharm はキーと値の組（patterns・groups）でなければなりません')
    return
  }
  if (parsed.appraisedCharm) {
    const first = parsed.appraisedCharm
    fail(node, `appraisedCharm が複数のファイルにあります（先の定義: ${first.file}:${first.line}）`)
    return
  }
  const value: MasterBundle['appraisedCharm'] = { patterns: [], groups: [] }
  for (const pair of node.items) {
    const key = keyName(pair.key)
    const child = pair.value as Node | null
    if (key !== 'patterns' && key !== 'groups') {
      fail(
        pair.key as Node,
        `appraisedCharm に未知のキー ${key} があります（patterns・groups だけを許します）`,
      )
    } else if (!isSeq(child)) {
      fail(child ?? (pair.key as Node), `appraisedCharm.${key} は配列でなければなりません`)
    } else {
      ;(value as unknown as Record<string, unknown>)[key] = child.toJSON()
    }
  }
  parsed.appraisedCharm = { file, ...at(node), value }
}

/** オーバーレイを変換の結果に重ねる。失敗は、ファイル名と行・桁を示す */
export function applyOverlays(
  files: OverlayFile[],
  base: MasterBundle,
  baseMismatches: SetBonusMismatch[],
): OverlayResult {
  const errors: OverlayError[] = []
  const parsed: Parsed = { replacements: [] }
  const sorted = [...files].sort((a, b) => compareCodeUnits(a.name, b.name))
  for (const file of sorted) parseFile(file, errors, parsed)

  const bundle = structuredClone(base)
  let mismatches = baseMismatches
  const seen = new Map<string, Replacement>()
  for (const replacement of parsed.replacements) {
    const { file, line, col, id, field, value } = replacement
    const fail = (message: string): void => {
      errors.push({ file, line, col, message })
    }
    const collection = COLLECTIONS[id.split(':')[0] ?? '']
    const entries = collection ? (bundle[collection] as unknown as { id: string }[]) : undefined
    const target = entries?.find((entryItem) => entryItem.id === id)
    if (!target) {
      fail(`ID ${id} が存在しません`)
      continue
    }
    if (field === 'id' || !Object.hasOwn(target, field)) {
      fail(`項目 ${field} が ${id} に存在しないか、置き換えられない項目です`)
      continue
    }
    const pairKey = `${id}\u0000${field}`
    const previous = seen.get(pairKey)
    if (previous) {
      fail(
        `${id} の ${field} が複数の箇所にあります（先の定義: ${previous.file}:${previous.line}）`,
      )
      continue
    }
    seen.set(pairKey, replacement)
    ;(target as unknown as Record<string, unknown>)[field] = value
    if (id.startsWith('sb:') && field === 'thresholds') {
      mismatches = mismatches.filter((mismatch) => mismatch.id !== id)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  if (parsed.appraisedCharm) bundle.appraisedCharm = parsed.appraisedCharm.value
  return { ok: true, bundle, mismatches }
}

export function formatOverlayError(error: OverlayError): string {
  return `${error.file}:${error.line}:${error.col}: ${error.message}`
}

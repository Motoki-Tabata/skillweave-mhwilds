import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { Node, YAMLMap } from 'yaml'
import type { ConditionId, Effect, EffectStat, MasterBundle, MasterDictionary } from '../index.ts'
import type { SetBonusMismatch } from './convert.ts'
import { CONDITION_ID_PATTERN, effectProblem } from './effects.ts'
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
  | {
      ok: true
      bundle: MasterBundle
      mismatches: SetBonusMismatch[]
      /** スキル ID → 読み。`applyReadings` で ja の辞書に重ねる */
      readings: Record<string, string>
      /** 発動条件 ID → ja・en の名前。`applyConditionNames` で辞書に重ねる */
      conditionNames: Record<string, { ja: string; en: string }>
    }
  | { ok: false; errors: OverlayError[] }

type Collection = Exclude<
  keyof MasterBundle,
  'version' | 'source' | 'appraisedCharm' | 'conditions'
>

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

interface ReadingEntry {
  file: string
  line: number
  col: number
  id: string
  value: string
}

interface Position {
  file: string
  line: number
  col: number
}

interface ConditionEntry extends Position {
  id: string
  ja: string
  en: string
}

interface ParsedEffect extends Position {
  stat: unknown
  value: unknown
  conditionId: unknown
}

interface EffectsEntry extends Position {
  id: string
  levels: ParsedEffect[][]
}

interface Parsed {
  replacements: Replacement[]
  readings: ReadingEntry[]
  conditions: ConditionEntry[]
  effects: EffectsEntry[]
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
    fail(
      root,
      '最上位はキーと値の組（replace・appraisedCharm・readings・conditions・effects）でなければなりません',
    )
    return
  }
  for (const pair of root.items) {
    const key = keyName(pair.key)
    const value = pair.value as Node | null
    if (key === 'replace') {
      parseReplace(value, file.name, at, fail, parsed)
    } else if (key === 'appraisedCharm') {
      parseAppraisedCharm(value, file.name, at, fail, parsed)
    } else if (key === 'readings') {
      parseReadings(value, file.name, at, fail, parsed)
    } else if (key === 'conditions') {
      parseConditions(value, file.name, at, fail, parsed)
    } else if (key === 'effects') {
      parseEffects(value, file.name, at, fail, parsed)
    } else {
      fail(
        pair.key as Node,
        `未知のキー ${key} です（replace・appraisedCharm・readings・conditions・effects だけを許します）`,
      )
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

function parseReadings(node: Node | null, file: string, at: At, fail: Fail, parsed: Parsed): void {
  if (!isMap(node)) {
    fail(node, 'readings はスキル ID と読みの組でなければなりません')
    return
  }
  for (const pair of node.items) {
    const keyNode = pair.key as Node
    const valueNode = pair.value as Node | null
    const id = keyName(keyNode)
    if (!isScalar(valueNode) || typeof valueNode.value !== 'string') {
      fail(valueNode ?? keyNode, `readings の ${id} の値は文字列でなければなりません`)
      continue
    }
    parsed.readings.push({ file, ...at(keyNode), id, value: valueNode.value })
  }
}

/** 文字列の値を持つ `key` を取る。無い・文字列でない・空のときは、`fail` で示して undefined */
function stringField(map: YAMLMap, key: string, label: string, fail: Fail): string | undefined {
  const node = map.get(key, true) as Node | null | undefined
  if (!map.has(key)) {
    fail(map as Node, `${label} に ${key} がありません`)
  } else if (!isScalar(node) || typeof node.value !== 'string' || node.value === '') {
    fail(node ?? (map as Node), `${label} の ${key} は空でない文字列でなければなりません`)
  } else {
    return node.value
  }
  return undefined
}

/** 許さないキーを `fail` で示す */
function rejectUnknownKeys(map: YAMLMap, allowed: string[], label: string, fail: Fail): void {
  for (const pair of map.items) {
    const key = keyName(pair.key)
    if (!allowed.includes(key)) {
      fail(
        pair.key as Node,
        `${label} に未知のキー ${key} があります（${allowed.join('・')} だけを許します）`,
      )
    }
  }
}

function parseConditions(
  node: Node | null,
  file: string,
  at: At,
  fail: Fail,
  parsed: Parsed,
): void {
  if (!isSeq(node)) {
    fail(node, 'conditions は配列でなければなりません')
    return
  }
  for (const item of node.items) {
    if (!isMap(item)) {
      fail(item as Node, 'conditions の要素はキーと値の組でなければなりません')
      continue
    }
    rejectUnknownKeys(item, ['id', 'name'], 'conditions の要素', fail)
    const id = stringField(item, 'id', 'conditions の要素', fail)
    if (id !== undefined && !CONDITION_ID_PATTERN.test(id)) {
      fail(
        item.get('id', true) as Node,
        `条件 ID ${id} が cd:<slug>（slug は ^[a-z][a-z0-9_]*$）の形ではありません`,
      )
    }
    const name = item.get('name', true) as Node | null | undefined
    if (!item.has('name')) {
      fail(item, 'conditions の要素に name がありません')
      continue
    }
    if (!isMap(name)) {
      fail(name ?? item, 'name は ja・en の組でなければなりません')
      continue
    }
    rejectUnknownKeys(name, ['ja', 'en'], 'name', fail)
    const ja = stringField(name, 'ja', 'name', fail)
    const en = stringField(name, 'en', 'name', fail)
    if (id !== undefined && ja !== undefined && en !== undefined) {
      parsed.conditions.push({ file, ...at(item), id, ja, en })
    }
  }
}

function parseEffect(
  item: Node | null,
  file: string,
  at: At,
  fail: Fail,
): ParsedEffect | undefined {
  if (!isMap(item)) {
    fail(item, '効果はキーと値の組でなければなりません')
    return undefined
  }
  rejectUnknownKeys(item, ['stat', 'value', 'conditionId'], '効果', fail)
  const missing = ['stat', 'value'].filter((key) => !item.has(key))
  if (missing.length > 0) {
    fail(item, `効果に ${missing.join('・')} がありません`)
    return undefined
  }
  return {
    file,
    ...at(item),
    stat: item.get('stat'),
    value: item.get('value'),
    conditionId: item.get('conditionId'),
  }
}

function parseEffects(node: Node | null, file: string, at: At, fail: Fail, parsed: Parsed): void {
  if (!isMap(node)) {
    fail(node, 'effects はスキル ID とレベルごとの効果の組でなければなりません')
    return
  }
  for (const pair of node.items) {
    const keyNode = pair.key as Node
    const id = keyName(keyNode)
    const levelsNode = pair.value as Node | null
    if (!isSeq(levelsNode)) {
      fail(levelsNode ?? keyNode, `effects の ${id} はレベルごとの効果の配列でなければなりません`)
      continue
    }
    const levels = levelsNode.items.map((levelNode) => {
      if (!isSeq(levelNode)) {
        fail(levelNode as Node, `effects の ${id} の各レベルは効果の配列でなければなりません`)
        return []
      }
      return levelNode.items.flatMap((effectNode) => {
        const effect = parseEffect(effectNode as Node | null, file, at, fail)
        return effect ? [effect] : []
      })
    })
    parsed.effects.push({ file, ...at(keyNode), id, levels })
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
  const parsed: Parsed = { replacements: [], readings: [], conditions: [], effects: [] }
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
    if (field === 'effectsByLevel') {
      fail(`${id} の effectsByLevel は replace で置き換えられません（effects で定義してください）`)
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

  const readings = collectReadings(parsed.readings, bundle, errors)
  const conditionNames = collectConditions(parsed.conditions, errors)
  applyEffects(
    parsed.effects,
    bundle,
    new Set(Object.keys(conditionNames)),
    parsed.conditions,
    errors,
  )

  if (errors.length > 0) return { ok: false, errors }
  if (parsed.appraisedCharm) bundle.appraisedCharm = parsed.appraisedCharm.value
  bundle.conditions = Object.keys(conditionNames).map((id) => ({ id: id as ConditionId }))
  return { ok: true, bundle, mismatches, readings, conditionNames }
}

/** 発動条件を、ID → ja・en の名前の組にする。ID の重複（ファイルをまたぐ）は失敗にする */
function collectConditions(
  entries: ConditionEntry[],
  errors: OverlayError[],
): Record<string, { ja: string; en: string }> {
  const names: Record<string, { ja: string; en: string }> = {}
  const seen = new Map<string, ConditionEntry>()
  for (const entry of entries) {
    const previous = seen.get(entry.id)
    if (previous) {
      errors.push({
        file: entry.file,
        line: entry.line,
        col: entry.col,
        message: `conditions の ${entry.id} が複数の箇所にあります（先の定義: ${previous.file}:${previous.line}）`,
      })
      continue
    }
    seen.set(entry.id, entry)
    names[entry.id] = { ja: entry.ja, en: entry.en }
  }
  return names
}

/** `effects` を検査して、スキルの `effectsByLevel` に入れる。どの効果からも参照されない条件は失敗にする */
function applyEffects(
  entries: EffectsEntry[],
  bundle: MasterBundle,
  conditionIds: ReadonlySet<string>,
  conditions: ConditionEntry[],
  errors: OverlayError[],
): void {
  const skills = new Map(bundle.skills.map((skill) => [skill.id as string, skill]))
  const known = new Set<string>(
    Object.values(COLLECTIONS).flatMap((name) =>
      (bundle[name] as unknown as { id: string }[]).map((entry) => entry.id),
    ),
  )
  // 他の失敗で効果が読まれなくても、参照の有無で重ねて失敗にしないよう、効果の記述から集める
  const referenced = new Set<string>(
    entries.flatMap((entry) =>
      entry.levels
        .flat()
        .flatMap((effect) => (typeof effect.conditionId === 'string' ? [effect.conditionId] : [])),
    ),
  )
  const seen = new Map<string, EffectsEntry>()
  for (const entry of entries) {
    const { file, id } = entry
    const fail = (message: string, where: { line: number; col: number } = entry): void => {
      errors.push({ file, line: where.line, col: where.col, message })
    }
    const skill = skills.get(id)
    const previous = seen.get(id)
    if (previous) {
      fail(`effects の ${id} が複数の箇所にあります（先の定義: ${previous.file}:${previous.line}）`)
      continue
    }
    if (!skill) {
      fail(
        known.has(id)
          ? `effects の ${id} はスキル（sk:）ではありません`
          : `effects の ID ${id} が存在しません`,
      )
      continue
    }
    seen.set(id, entry)
    if (entry.levels.length !== skill.maxLevel) {
      fail(
        `effects の ${id} のレベルの数 ${entry.levels.length} が最大レベル ${skill.maxLevel} と違います`,
      )
      continue
    }
    skill.effectsByLevel = entry.levels.map((level) =>
      level.flatMap((effect) => {
        const result = toEffect(effect, conditionIds)
        if (typeof result === 'string') {
          fail(`effects の ${id}: ${result}`, effect)
          return []
        }
        return [result]
      }),
    )
  }
  for (const { file, line, col, id } of conditions) {
    if (!referenced.has(id)) {
      errors.push({ file, line, col, message: `条件 ${id} がどの効果からも参照されていません` })
    }
  }
}

/** 読んだ効果を `Effect` にする。規則に反するときは、その理由の文字列を返す */
function toEffect(effect: ParsedEffect, conditionIds: ReadonlySet<string>): Effect | string {
  const problem = effectProblem(effect.stat, effect.value)
  if (problem) return problem
  const result: Effect = { stat: effect.stat as EffectStat, value: effect.value as number }
  if (effect.conditionId === undefined) return result
  if (typeof effect.conditionId !== 'string' || !conditionIds.has(effect.conditionId)) {
    return `conditionId ${JSON.stringify(effect.conditionId)} が conditions にありません`
  }
  result.conditionId = effect.conditionId as ConditionId
  return result
}

/** 読みの ID を検査して、スキル ID → 読みの組にする */
function collectReadings(
  entries: ReadingEntry[],
  bundle: MasterBundle,
  errors: OverlayError[],
): Record<string, string> {
  const skillIds = new Set<string>(bundle.skills.map((skill) => skill.id))
  const known = new Set<string>(
    Object.values(COLLECTIONS).flatMap((name) =>
      (bundle[name] as unknown as { id: string }[]).map((entry) => entry.id),
    ),
  )
  const readings: Record<string, string> = {}
  const seen = new Map<string, ReadingEntry>()
  for (const entry of entries) {
    const { file, line, col, id } = entry
    const fail = (message: string): void => {
      errors.push({ file, line, col, message })
    }
    const previous = seen.get(id)
    if (previous) {
      fail(
        `readings の ${id} が複数の箇所にあります（先の定義: ${previous.file}:${previous.line}）`,
      )
    } else if (skillIds.has(id)) {
      seen.set(id, entry)
      readings[id] = entry.value
    } else if (known.has(id)) {
      fail(`readings の ${id} はスキル（sk:）ではありません`)
    } else {
      fail(`readings の ID ${id} が存在しません`)
    }
  }
  return readings
}

/** 読みを、ja の辞書のスキルの項目に重ねる（元の辞書は変えない） */
export function applyReadings(
  dictionary: MasterDictionary,
  readings: Record<string, string>,
): MasterDictionary {
  const entries = { ...dictionary.entries }
  for (const [id, reading] of Object.entries(readings)) {
    const entry = entries[id]
    if (entry) entries[id] = { ...entry, reading }
  }
  return { ...dictionary, entries }
}

/** 発動条件の名前を、辞書の項目として重ねる（元の辞書は変えない） */
export function applyConditionNames(
  dictionary: MasterDictionary,
  conditionNames: Record<string, { ja: string; en: string }>,
): MasterDictionary {
  const entries = { ...dictionary.entries }
  for (const [id, names] of Object.entries(conditionNames)) {
    entries[id] = { name: names[dictionary.locale] }
  }
  return { ...dictionary, entries }
}

export function formatOverlayError(error: OverlayError): string {
  return `${error.file}:${error.line}:${error.col}: ${error.message}`
}

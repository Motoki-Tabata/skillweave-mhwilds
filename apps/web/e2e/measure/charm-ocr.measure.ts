/**
 * 護石の詳細画面の画像を OCR（Tesseract.js）で読む測定（機能 015・受入基準 AC-7〜AC-11・AC-15）。
 * CI では実行しない。画像は git 管理外の e2e/measure/charm-ocr/images/、正解は labels.json。
 * 失敗にするのは、事前の検査（AC-8）・ラベルの誤り・通信の検査（AC-10）だけ。
 * 精度と時間は合否（PASS／FAIL）を出力するだけで、テストの失敗にしない。
 * 実行: pnpm --filter @swv/web exec playwright test --project=measure e2e/measure/charm-ocr.measure.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { expect, test } from '@playwright/test'

const MEASURE_DIR = join(import.meta.dirname, 'charm-ocr')
const IMAGES_DIR = join(MEASURE_DIR, 'images')
const DIST_DIR = join(import.meta.dirname, '../../../../packages/data/dist')
const MIN_IMAGES = 20
const PASS_RATE = 0.9
const PASS_MAX_MS = 3000
const MIMES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}
/** worker・WASM コア・言語データの自オリジンのパス。これらのリクエストを記録できていなければ監視が素通りしている。 */
const TESSERACT_PATHS = [
  { label: 'tesseract/worker.min.js', test: (p: string) => p.endsWith('/tesseract/worker.min.js') },
  { label: 'tesseract/core/', test: (p: string) => p.includes('/tesseract/core/') },
  {
    label: 'tesseract/lang/jpn.traineddata.gz',
    test: (p: string) => p.endsWith('/tesseract/lang/jpn.traineddata.gz'),
  },
]

interface LabelSkill {
  name: string
  level: number
}
interface LabelSlot {
  target: string
  level: number
}
interface Label {
  skills: LabelSkill[]
  slots: LabelSlot[]
}
interface ReadResult {
  skills: ({ skillId: string; level: number } | null)[]
  slots: ({ target: string; level: number } | null)[]
  lines: string[]
}
interface ReadOutput {
  result: ReadResult
  ms: number
  width: number
  height: number
}
interface OcrApi {
  init: () => Promise<{ initMs: number }>
  read: (base64: string, mime: string) => Promise<ReadOutput>
}
interface ExpectedCharm {
  skills: { id: string; name: string; level: number }[]
  slots: LabelSlot[]
}

/** ja 辞書から、護石に付くスキル（武器・防具スキル）の「名前 → ID」を作る。 */
function loadSkillIdsByName(): Map<string, string[]> {
  const masterFile = readdirSync(DIST_DIR).find(
    (f) => /^master-[^.]+(\.[^.]+)*\.json$/.test(f) && !/\.(ja|en)\.json$/.test(f),
  )
  if (masterFile === undefined) throw new Error('packages/data/dist/ のマスターが無い')
  const master = JSON.parse(readFileSync(join(DIST_DIR, masterFile), 'utf8')) as {
    version: string
    skills: { id: string; kind: string }[]
  }
  const dictionary = JSON.parse(
    readFileSync(join(DIST_DIR, `master-${master.version}.ja.json`), 'utf8'),
  ) as { entries: Record<string, { name: string }> }
  const byName = new Map<string, string[]>()
  for (const skill of master.skills) {
    if (skill.kind !== 'armor' && skill.kind !== 'weapon') continue
    const name = dictionary.entries[skill.id]?.name
    if (name === undefined) continue
    byName.set(name, [...(byName.get(name) ?? []), skill.id])
  }
  return byName
}

function listImages(): string[] {
  if (!existsSync(IMAGES_DIR)) return []
  return readdirSync(IMAGES_DIR)
    .filter((f) => extname(f).toLowerCase() in MIMES)
    .sort()
}

/** 事前の検査（AC-8）。ブラウザを開く前に呼ぶ。問題があれば理由を並べて例外にする。 */
function precheck(): { files: string[]; expected: Map<string, ExpectedCharm> } {
  const problems: string[] = []
  const labels = JSON.parse(readFileSync(join(MEASURE_DIR, 'labels.json'), 'utf8')) as Record<
    string,
    Label
  >
  const files = listImages()
  if (!existsSync(IMAGES_DIR)) problems.push(`画像の置き場が無い: ${IMAGES_DIR}`)

  const unlabeled = files.filter((f) => !(f in labels))
  if (unlabeled.length > 0) problems.push(`正解ラベルの無い画像がある: ${unlabeled.join(', ')}`)

  const labeledFiles = files.filter((f) => f in labels)
  const missingImages = Object.keys(labels).filter((f) => !files.includes(f))
  if (missingImages.length > 0) {
    console.warn(`警告: 画像の無いラベルは数えない: ${missingImages.join(', ')}`)
  }
  if (labeledFiles.length < MIN_IMAGES) {
    problems.push(`正解ラベルのある画像が ${MIN_IMAGES} 枚未満: ${labeledFiles.length} 枚`)
  }

  const idsByName = loadSkillIdsByName()
  const expected = new Map<string, ExpectedCharm>()
  for (const file of labeledFiles) {
    const label = labels[file]
    if (label === undefined) continue
    const skills: ExpectedCharm['skills'] = []
    for (const skill of label.skills) {
      const ids = idsByName.get(skill.name)
      if (ids?.length !== 1) {
        problems.push(
          `ラベルの誤り: ${file} のスキル名「${skill.name}」が ja 辞書に完全一致で一意に無い（一致 ${ids?.length ?? 0} 件）`,
        )
        continue
      }
      skills.push({ id: ids[0] ?? '', name: skill.name, level: skill.level })
    }
    expected.set(file, { skills, slots: label.slots })
  }

  if (problems.length > 0) throw new Error(`測定の事前の検査に失敗:\n- ${problems.join('\n- ')}`)
  return { files: labeledFiles, expected }
}

/** スキルとスロットの並びと数の完全一致で比べ、不一致の項目を返す。null は不一致。 */
function diffCharm(expected: ExpectedCharm, got: ReadResult): string[] {
  const diffs: string[] = []
  const count = (kind: string, e: number, g: number) => {
    if (e !== g) diffs.push(`${kind}: expected ${e} items, got ${g}`)
  }
  count('skills', expected.skills.length, got.skills.length)
  expected.skills.forEach((e, i) => {
    const g = got.skills[i]
    if (g?.skillId !== e.id || g.level !== e.level) {
      const gotText = g ? `${g.skillId} Lv${g.level}` : 'null'
      diffs.push(`skills[${i}]: expected ${e.name} Lv${e.level}, got ${gotText}`)
    }
  })
  count('slots', expected.slots.length, got.slots.length)
  expected.slots.forEach((e, i) => {
    const g = got.slots[i]
    if (g?.target !== e.target || g.level !== e.level) {
      const gotText = g ? `${g.target} Lv${g.level}` : 'null'
      diffs.push(`slots[${i}]: expected ${e.target} Lv${e.level}, got ${gotText}`)
    }
  })
  return diffs
}

test.setTimeout(600_000)

test('015 護石の画像を OCR で読む測定', async ({ browser, baseURL }) => {
  expect(baseURL).toBeDefined()
  const origin = new URL(baseURL ?? '').origin

  // 事前の検査（AC-8）。ブラウザを開く前
  const { files, expected } = precheck()

  const context = await browser.newContext({ baseURL })
  const requested: string[] = []
  // page.goto の前に監視を始める（worker からのリクエストも context で拾う）
  context.on('request', (request) => requested.push(request.url()))
  const page = await context.newPage()

  try {
    await page.goto('/e2e/measure/charm-ocr/index.html')
    await page.waitForFunction(
      () => (globalThis as unknown as { swvCharmOcrReady?: boolean }).swvCharmOcrReady === true,
    )
    const { initMs } = await page.evaluate(() =>
      (globalThis as unknown as { swvCharmOcr: OcrApi }).swvCharmOcr.init(),
    )

    const rows: {
      file: string
      ok: boolean
      diffs: string[]
      ms: number
      width: number
      height: number
      lines: string[]
    }[] = []
    for (const file of files) {
      const base64 = readFileSync(join(IMAGES_DIR, file)).toString('base64')
      const mime = MIMES[extname(file).toLowerCase()] ?? 'image/png'
      const out = await page.evaluate(
        ([b, m]) => (globalThis as unknown as { swvCharmOcr: OcrApi }).swvCharmOcr.read(b, m),
        [base64, mime] as const,
      )
      const exp = expected.get(file)
      if (exp === undefined) throw new Error(`期待値が無い: ${file}`)
      const diffs = diffCharm(exp, out.result)
      rows.push({
        file,
        ok: diffs.length === 0,
        diffs,
        ms: out.ms,
        width: out.width,
        height: out.height,
        lines: out.result.lines,
      })
    }

    // 通信の検査（AC-10）
    const paths = requested
      .filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'))
      .map((u) => new URL(u))
    const foreign = [...new Set(paths.filter((u) => u.origin !== origin).map((u) => u.href))]
    const missing = TESSERACT_PATHS.filter(
      (t) => !paths.some((u) => u.origin === origin && t.test(u.pathname)),
    ).map((t) => t.label)

    // 出力（AC-9・AC-11）
    for (const r of rows) {
      console.log(
        [
          `${r.file}: ${r.ok ? 'MATCH' : 'MISMATCH'} (${r.ms.toFixed(0)} ms, ${r.width}x${r.height})`,
          ...r.diffs.map((d) => `  ${d}`),
          `  lines: ${JSON.stringify(r.lines)}`,
        ].join('\n'),
      )
    }
    const matched = rows.filter((r) => r.ok).length
    const rate = matched / rows.length
    const maxMs = Math.max(...rows.map((r) => r.ms))
    const resolutions = [...new Set(rows.map((r) => `${r.width}x${r.height}`))].join(', ')
    const pass = rate >= PASS_RATE && maxMs <= PASS_MAX_MS
    console.log(
      [
        `browser: chromium ${browser.version()}`,
        `images: ${rows.length} (resolutions: ${resolutions})`,
        `exact match: ${matched}/${rows.length} = ${(rate * 100).toFixed(1)}% (threshold ${PASS_RATE * 100}%)`,
        `max recognition ms: ${maxMs.toFixed(0)} (threshold ${PASS_MAX_MS} ms)`,
        `init ms: ${initMs.toFixed(0)}`,
        `verdict: ${pass ? 'PASS' : 'FAIL'}`,
        `tesseract requests recorded: ${TESSERACT_PATHS.length - missing.length}/${TESSERACT_PATHS.length}`,
      ].join('\n'),
    )

    expect(foreign, `自オリジン以外へのリクエスト: ${foreign.join(', ')}`).toEqual([])
    expect(
      missing,
      `監視が worker の通信を捉えていない（記録に無い: ${missing.join(', ')}）`,
    ).toEqual([])
  } finally {
    await context.close()
  }
})

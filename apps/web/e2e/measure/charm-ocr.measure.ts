/**
 * 護石の詳細画面の画像を OCR（Tesseract.js）で読む測定（機能 016・受入基準 AC-12〜AC-14。015 の AC-8・AC-10 を引き継ぐ）。
 * CI では実行しない。画像は git 管理外の e2e/measure/charm-ocr/images/、正解は labels.json。
 * 失敗にするのは、事前の検査・ラベルの誤り・通信の検査（自オリジン以外か GET 以外）だけ。
 * 判定（plan D4）: 行ごとに正解と位置で突き合わせ、空欄（null）と誤った値で埋めた行を分ける。
 * 合否（PASS／FAIL）は、誤り 0 件かつ認識時間の最大が 3000 ms 以下。出力するだけで、テストの失敗にしない。
 * 実行: pnpm --filter @swv/web exec playwright test --project=measure e2e/measure/charm-ocr.measure.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { expect, test } from '@playwright/test'

const MEASURE_DIR = join(import.meta.dirname, 'charm-ocr')
const IMAGES_DIR = join(MEASURE_DIR, 'images')
const DIST_DIR = join(import.meta.dirname, '../../../../packages/data/dist')
const MIN_IMAGES = 20
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

interface Judgement {
  /** 誤った値で埋めた行（項目つきの説明）。 */
  wrong: string[]
  /** 空欄の行（結果が null。誤りに数えない）。 */
  blank: string[]
}

/**
 * 1つの位置を判定する（plan D4）。e は正解の行の説明（無ければ undefined）、g は結果の行
 * （null は空欄、undefined は結果に行が無い）。same は両方の行があるときの一致。
 */
function judgeRow(
  label: string,
  e: string | undefined,
  g: string | null | undefined,
  same: boolean,
  out: Judgement,
): void {
  const expectedText = e ?? 'no row'
  if (g === null) {
    out.blank.push(`${label}: expected ${expectedText}, got null (blank)`)
  } else if (g === undefined) {
    // 正解に行があるのに結果に行が無い。「無い」と埋めたことになる
    if (e !== undefined) out.wrong.push(`${label}: expected ${e}, got missing row`)
  } else if (e === undefined || !same) {
    out.wrong.push(`${label}: expected ${expectedText}, got ${g}`)
  }
}

/** スキルとスロットを位置で突き合わせる。 */
function judgeCharm(expected: ExpectedCharm, got: ReadResult): Judgement {
  const out: Judgement = { wrong: [], blank: [] }
  const skillCount = Math.max(expected.skills.length, got.skills.length)
  for (let i = 0; i < skillCount; i++) {
    const e = expected.skills[i]
    const g = got.skills[i]
    judgeRow(
      `skills[${i}]`,
      e && `${e.name} Lv${e.level}`,
      g === undefined || g === null ? g : `${g.skillId} Lv${g.level}`,
      e !== undefined && g != null && g.skillId === e.id && g.level === e.level,
      out,
    )
  }
  const slotCount = Math.max(expected.slots.length, got.slots.length)
  for (let i = 0; i < slotCount; i++) {
    const e = expected.slots[i]
    const g = got.slots[i]
    judgeRow(
      `slots[${i}]`,
      e && `${e.target} Lv${e.level}`,
      g === undefined || g === null ? g : `${g.target} Lv${g.level}`,
      e !== undefined && g != null && g.target === e.target && g.level === e.level,
      out,
    )
  }
  return out
}

test.setTimeout(600_000)

test('016 護石の画像を OCR で読む測定', async ({ browser, baseURL }) => {
  expect(baseURL).toBeDefined()
  const origin = new URL(baseURL ?? '').origin

  // 事前の検査。ブラウザを開く前
  const { files, expected } = precheck()

  const context = await browser.newContext({ baseURL })
  const requested: { url: string; method: string }[] = []
  // page.goto の前に監視を始める（worker からのリクエストも context で拾う）
  context.on('request', (request) =>
    requested.push({ url: request.url(), method: request.method() }),
  )
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
      wrong: string[]
      blank: string[]
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
      const { wrong, blank } = judgeCharm(exp, out.result)
      rows.push({
        file,
        wrong,
        blank,
        ms: out.ms,
        width: out.width,
        height: out.height,
        lines: out.result.lines,
      })
    }

    // 通信の検査（AC-14）。data:・blob: は除く
    const recorded = requested
      .filter((r) => !r.url.startsWith('data:') && !r.url.startsWith('blob:'))
      .map((r) => ({ url: new URL(r.url), method: r.method }))
    const foreign = [
      ...new Set(recorded.filter((r) => r.url.origin !== origin).map((r) => r.url.href)),
    ]
    const nonGet = [
      ...new Set(
        recorded.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.url.href}`),
      ),
    ]
    const paths = recorded.filter((r) => r.url.origin === origin).map((r) => r.url)
    const missing = TESSERACT_PATHS.filter((t) => !paths.some((u) => t.test(u.pathname))).map(
      (t) => t.label,
    )

    // 出力（AC-12・AC-13）
    for (const r of rows) {
      const status = r.wrong.length === 0 && r.blank.length === 0 ? 'MATCH' : 'MISMATCH'
      console.log(
        [
          `${r.file}: ${status} wrong=${r.wrong.length} blank=${r.blank.length} (${r.ms.toFixed(0)} ms, ${r.width}x${r.height})`,
          ...r.wrong.map((d) => `  WRONG ${d}`),
          ...r.blank.map((d) => `  BLANK ${d}`),
          `  lines: ${JSON.stringify(r.lines)}`,
        ].join('\n'),
      )
    }
    const matched = rows.filter((r) => r.wrong.length === 0 && r.blank.length === 0).length
    const rate = matched / rows.length
    const wrongTotal = rows.reduce((sum, r) => sum + r.wrong.length, 0)
    const blankTotal = rows.reduce((sum, r) => sum + r.blank.length, 0)
    const maxMs = Math.max(...rows.map((r) => r.ms))
    const resolutions = [...new Set(rows.map((r) => `${r.width}x${r.height}`))].join(', ')
    const pass = wrongTotal === 0 && maxMs <= PASS_MAX_MS
    console.log(
      [
        `browser: chromium ${browser.version()}`,
        `images: ${rows.length} (resolutions: ${resolutions})`,
        `wrong rows: ${wrongTotal}`,
        `blank rows: ${blankTotal}`,
        `exact match: ${matched}/${rows.length} = ${(rate * 100).toFixed(1)}% (not used for verdict)`,
        `max recognition ms: ${maxMs.toFixed(0)} (threshold ${PASS_MAX_MS} ms)`,
        `init ms: ${initMs.toFixed(0)}`,
        `verdict: ${pass ? 'PASS' : 'FAIL'} (wrong rows 0 and max <= ${PASS_MAX_MS} ms)`,
        `tesseract requests recorded: ${TESSERACT_PATHS.length - missing.length}/${TESSERACT_PATHS.length}`,
      ].join('\n'),
    )

    expect(foreign, `自オリジン以外へのリクエスト: ${foreign.join(', ')}`).toEqual([])
    expect(nonGet, `GET 以外のリクエスト: ${nonGet.join(', ')}`).toEqual([])
    expect(
      missing,
      `監視が worker の通信を捉えていない（記録に無い: ${missing.join(', ')}）`,
    ).toEqual([])
  } finally {
    await context.close()
  }
})

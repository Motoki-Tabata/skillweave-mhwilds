import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import type { MasterBundle, MasterDictionary } from '@swv/data'
import { inspectCharmImage } from '@/lib/ocr/inspect'
import { createCharmReader } from '@/lib/ocr/reader'
import type { CharmReader, CharmReadResult } from '@/lib/ocr/types'

/** 1回に読み取る画像の上限（AC-2） */
export const OCR_MAX_IMAGES = 20

export type OcrRoute = 'pick' | 'paste' | 'drop'
export type OcrPhase = 'idle' | 'preparing' | 'reading'

/** 待ち列の1件。元の画像は持たない（AC-10）。 */
export interface OcrQueueItem {
  key: string
  result: CharmReadResult
  previewUrl: string
  name: string
}

export interface SkippedImage {
  name: string
  reason: 'notWide' | 'notImage'
}

export type OcrFailure = { kind: 'prepare' } | { kind: 'read'; index: number }

export interface OcrSource {
  bundle: MasterBundle
  dictionary: MasterDictionary
}

export interface CharmOcrQueueOptions {
  /** 読み取りに使うマスター。まだ無ければ null */
  source: () => OcrSource | null
  /** false のあいだは画像を受け付けない */
  enabled: () => boolean
}

interface Target {
  file: File | null
  name: string
  preview: Blob
}

/** 受け取った名前（貼り付けは常に連番。Chromium が `image.png` を付けるため）。 */
function nameOf(file: File, route: OcrRoute, index: number): string {
  return route === 'paste' ? `貼り付けた画像 ${index + 1}` : file.name
}

/**
 * 護石の画像の読み取りの待ち列（D12）。画面のスコープに置き、スコープを離れたら待ち列・切り抜きの URL・worker を破棄する。
 * 画像は IndexedDB などに書かない。
 */
export function useCharmOcrQueue(options: CharmOcrQueueOptions) {
  const phase = ref<OcrPhase>('idle')
  const progress = ref({ k: 0, n: 0 })
  const items = shallowRef<OcrQueueItem[]>([])
  const skipped = ref<SkippedImage[]>([])
  /** 21 枚目以降で読み取らなかった枚数 */
  const overflow = ref(0)
  const failure = ref<OcrFailure | null>(null)

  let reader: CharmReader | null = null
  let disposed = false
  let sequence = 0

  const head = computed(() => items.value[0] ?? null)

  function revoke(item: OcrQueueItem): void {
    URL.revokeObjectURL(item.previewUrl)
  }

  function next(): void {
    const [first, ...rest] = items.value
    if (first === undefined) return
    revoke(first)
    items.value = rest
  }

  function clear(): void {
    items.value.forEach(revoke)
    items.value = []
    skipped.value = []
    overflow.value = 0
  }

  async function discardReader(): Promise<void> {
    const current = reader
    reader = null
    await current?.terminate().catch(() => undefined)
  }

  onScopeDispose(() => {
    disposed = true
    items.value.forEach(revoke)
    items.value = []
    void discardReader()
  })

  /** 画像を検査し、読み取れるものだけを返す。対象外は理由を記録する。 */
  async function inspectAll(files: File[], route: OcrRoute): Promise<Target[]> {
    const targets: Target[] = []
    for (const [index, file] of files.entries()) {
      const name = nameOf(file, route, index)
      const inspected = await inspectCharmImage(file)
      if (disposed) return []
      if (inspected.kind === 'ok') targets.push({ file, name, preview: inspected.preview })
      else skipped.value = [...skipped.value, { name, reason: inspected.kind }]
    }
    return targets
  }

  /** reader を用意する。作れなかったら（または画面を離れていたら）false。 */
  async function prepareReader(source: OcrSource): Promise<boolean> {
    if (reader !== null) return true
    try {
      const created = await createCharmReader(source.bundle, source.dictionary)
      if (disposed) {
        await created.terminate().catch(() => undefined)
        return false
      }
      reader = created
      return true
    } catch {
      if (!disposed) failure.value = { kind: 'prepare' }
      return false
    }
  }

  async function readAll(targets: Target[]): Promise<void> {
    phase.value = 'reading'
    for (const [index, target] of targets.entries()) {
      progress.value = { k: index + 1, n: targets.length }
      const current = reader
      if (current === null || target.file === null) return
      let result: CharmReadResult
      try {
        result = await current.read(target.file)
      } catch {
        if (disposed) return
        failure.value = { kind: 'read', index: index + 1 }
        await discardReader()
        return
      }
      target.file = null
      if (disposed) return
      sequence += 1
      items.value = [
        ...items.value,
        {
          key: `ocr-${sequence}`,
          result,
          previewUrl: URL.createObjectURL(target.preview),
          name: target.name,
        },
      ]
    }
  }

  async function accept(files: File[], route: OcrRoute): Promise<void> {
    if (phase.value !== 'idle' || !options.enabled() || files.length === 0) return
    skipped.value = []
    overflow.value = 0
    failure.value = null
    const taken = files.slice(0, OCR_MAX_IMAGES)
    overflow.value = files.length - taken.length
    phase.value = 'preparing'
    try {
      const targets = await inspectAll(taken, route)
      const source = options.source()
      if (disposed || targets.length === 0 || source === null) return
      if (!(await prepareReader(source))) return
      await readAll(targets)
    } finally {
      phase.value = 'idle'
    }
  }

  return { phase, progress, items, head, skipped, overflow, failure, accept, next, clear }
}

export type CharmOcrQueue = ReturnType<typeof useCharmOcrQueue>

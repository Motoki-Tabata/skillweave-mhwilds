<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Cloud, Smartphone } from '@lucide/vue'
import CharmForm from '@/components/charms/CharmForm.vue'
import CharmListItem from '@/components/charms/CharmListItem.vue'
import DeleteConfirmDialog from '@/components/common/DeleteConfirmDialog.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { charmSummary } from '@/lib/charms/format'
import type { CharmEntry } from '@/stores/charms'
import { useCharmsStore } from '@/stores/charms'
import { useMasterStore } from '@/stores/master'

const master = useMasterStore()
const charms = useCharmsStore()

const form = ref<InstanceType<typeof CharmForm> | null>(null)
const heading = ref<HTMLElement | null>(null)
const listRoot = ref<HTMLElement | null>(null)
const editingId = ref<string | null>(null)
const deleting = ref<CharmEntry | null>(null)
const deleteOpen = ref(false)
let focusAfterDialog: (() => void) | null = null

const editing = computed(() => charms.charms.find((charm) => charm.id === editingId.value) ?? null)
/** 最初の読み込みが終わるまでは画面全体を読込中にする。以降の読み直しは、フォームを残して一覧だけを読込中にする。 */
const initialLoad = ref(charms.status === 'loading')
watch(
  () => charms.status,
  (status) => {
    if (status !== 'loading') initialLoad.value = false
  },
)
const loading = computed(
  () => master.status === 'loading' || (initialLoad.value && charms.status === 'loading'),
)
const listLoading = computed(() => charms.status === 'loading')
const hasSource = computed(() => charms.source !== 'unknown')
const isAccount = computed(() => charms.source === 'account')
/** 削除の確認の本文。アカウントの護石のときだけ、ほかの端末からも消える旨を足す。 */
const deleteDescription = computed(() => {
  const summary =
    deleting.value === null ? '' : charmSummary(deleting.value.charm.payload, master.nameOf)
  return `${summary}。削除すると元に戻せません。${
    isAccount.value ? '同じアカウントのほかの端末からも消えます。' : ''
  }`
})
const showDeviceBand = computed(
  () => isAccount.value && charms.deviceCharmCount !== null && charms.deviceCharmCount > 0,
)

// 読み込みが 300ms 未満で終わるときは、スケルトンを出さない（ちらつきを避ける）
const showSkeleton = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearSkeletonTimer(): void {
  if (skeletonTimer !== undefined) clearTimeout(skeletonTimer)
  skeletonTimer = undefined
}

watch(
  () => master.status === 'loading' || charms.status === 'loading',
  (isLoading) => {
    clearSkeletonTimer()
    showSkeleton.value = false
    if (!isLoading) return
    skeletonTimer = setTimeout(() => {
      showSkeleton.value = true
    }, LOADING_SKELETON_DELAY_MS)
  },
  { immediate: true },
)

onMounted(() => {
  if (master.bundle === null) void master.load()
  void charms.ensureLoaded()
})
onBeforeUnmount(clearSkeletonTimer)

const formDisabled = computed(() => charms.status !== 'ready')
const formDisabledMessage = computed(() => {
  if (charms.status === 'failed') return '護石を読み込めないため、護石を登録できません。'
  if (charms.status === 'unavailable') return '端末に保存できないため、護石を登録できません。'
  return ''
})

// ログアウト・401 で保存先が変わったら、編集のモードを終える（入力は捨てる。登録のモードの入力は残る）
watch(
  () => charms.source,
  (source) => {
    if (source !== 'account') editingId.value = null
  },
)

/** 読み込み（読み直し・端末への切り替え）が終わるまで待つ。 */
function settled(): Promise<void> {
  if (charms.status !== 'loading') return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(
      () => charms.status,
      (status) => {
        if (status === 'loading') return
        stop()
        resolve()
      },
    )
  })
}

/** フォーカスが失われている（押したボタンが消えた）ときだけ、一覧の見出しへ移す。 */
async function focusHeadingIfLost(): Promise<void> {
  await settled()
  await nextTick()
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) heading.value?.focus()
}

/** 更新の 409・404・401 のあとの扱い（一覧の読み直しと端末への切り替えは store が済ませている）。 */
async function onRejected(result: 'conflict' | 'notFound' | 'expired'): Promise<void> {
  if (result === 'expired') {
    await focusHeadingIfLost()
    return
  }
  const id = editingId.value
  editingId.value = null
  await settled()
  await nextTick()
  const edit = result === 'conflict' && id !== null ? queryButton('data-edit-id', id) : null
  ;(edit ?? heading.value)?.focus()
}

function queryButton(attribute: 'data-edit-id' | 'data-delete-id', id: string): HTMLElement | null {
  return listRoot.value?.querySelector<HTMLElement>(`[${attribute}="${id}"]`) ?? null
}

function startEdit(id: string): void {
  editingId.value = id
  void nextTick(() => form.value?.focusRarity())
}

function finishEdit(): void {
  const id = editingId.value
  editingId.value = null
  if (id !== null) void nextTick(() => queryButton('data-edit-id', id)?.focus())
}

function askDelete(entry: CharmEntry): void {
  deleting.value = entry
  deleteOpen.value = true
  focusAfterDialog = () => queryButton('data-delete-id', entry.charm.id)?.focus()
}

/** 削除したあとのフォーカス: 次の行の削除 → 前の行の削除 → 一覧の見出し。 */
function focusTargetAfterRemove(id: string): () => void {
  const ids = charms.charms.map((charm) => charm.id)
  const index = ids.indexOf(id)
  const neighbor = ids[index + 1] ?? ids[index - 1]
  return () => {
    const button = neighbor === undefined ? null : queryButton('data-delete-id', neighbor)
    ;(button ?? heading.value)?.focus()
  }
}

async function confirmDelete(): Promise<void> {
  const target = deleting.value
  if (target === null) return
  const id = target.charm.id
  const own = focusAfterDialog
  focusAfterDialog = focusTargetAfterRemove(id)
  const result = await charms.remove(id)
  if (result === 'saved') {
    if (editingId.value === id) editingId.value = null
    return
  }
  focusAfterDialog = own
  if (result === 'expired') await focusHeadingIfLost()
}

function onDialogCloseAutoFocus(event: Event): void {
  event.preventDefault()
  const focus = focusAfterDialog
  focusAfterDialog = null
  void nextTick(() => focus?.())
}
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <h1
      class="text-xl leading-snug font-semibold"
      :class="loading || master.status === 'failed' || !hasSource ? 'mb-4' : 'mb-1'"
    >
      護石
    </h1>

    <!-- 読込中 -->
    <div v-if="loading" class="flex flex-col gap-4">
      <template v-if="showSkeleton">
        <output class="block text-sm">護石とマスターデータを読み込んでいます…</output>
        <Skeleton class="h-64 w-full" />
        <Skeleton class="h-32 w-full" />
      </template>
    </div>

    <!-- マスターの読込失敗 -->
    <div v-else-if="master.status === 'failed'" class="flex flex-col items-start gap-3">
      <ResultAlert tone="error" title="データを読み込めませんでした">
        <p>{{ master.failureMessage }}</p>
        <p>通信状況を確かめて、「再読み込み」を押してください。</p>
      </ResultAlert>
      <Button type="button" class="h-10" @click="master.load()">再読み込み</Button>
    </div>

    <template v-else>
      <p v-if="hasSource" class="mb-4 flex items-center gap-1 text-sm">
        <Cloud v-if="isAccount" class="text-muted-foreground size-4" aria-hidden="true" />
        <Smartphone v-else class="text-muted-foreground size-4" aria-hidden="true" />
        {{ isAccount ? '保存先: アカウント' : '保存先: この端末' }}
      </p>
      <ResultAlert v-if="showDeviceBand" tone="info" class="mb-4">
        <p>
          この端末には、ログインしていないときに登録した護石が {{ charms.deviceCharmCount }}
          件残っています。ログインしている間は表示せず、検索にも使いません。ログアウトすると、ふたたび表示します。
        </p>
      </ResultAlert>
      <div
        class="flex flex-col gap-4 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-6"
      >
        <CharmForm
          ref="form"
          :editing="editing"
          :disabled="formDisabled"
          :disabled-message="formDisabledMessage"
          @saved="finishEdit"
          @cancel="finishEdit"
          @rejected="onRejected"
        />

        <section ref="listRoot" class="flex flex-col gap-2">
          <h2 ref="heading" tabindex="-1" class="text-base leading-snug font-semibold outline-none">
            登録済みの護石（{{ charms.charms.length }}）
          </h2>

          <div v-if="listLoading" class="flex flex-col gap-2">
            <template v-if="showSkeleton">
              <output class="block text-sm">護石とマスターデータを読み込んでいます…</output>
              <Skeleton class="h-32 w-full" />
            </template>
          </div>

          <div v-else-if="charms.status !== 'ready'" class="flex flex-col items-start gap-3">
            <ResultAlert
              tone="error"
              :title="charms.status === 'failed' ? '護石を読み込めません' : '護石を保存できません'"
            >
              <p>{{ charms.failureMessage }}</p>
              <p v-if="isAccount">
                通信の状態を確かめて、「再読み込み」を押してください。護石なしの検索は引き続き使えます。
              </p>
              <p v-else>
                ブラウザの設定でこのサイトのデータの保存を許可するか、プライベートブラウズをやめてから、「再読み込み」を押してください。護石なしの検索は引き続き使えます。
              </p>
            </ResultAlert>
            <Button type="button" variant="outline" class="h-11" @click="charms.reload()">
              再読み込み
            </Button>
          </div>

          <template v-else>
            <p v-if="charms.excludedCount > 0" class="text-muted-foreground text-xs">
              検索の候補になるのは {{ charms.candidateCount }} 件です。
            </p>
            <div v-if="charms.charms.length === 0" class="flex flex-col items-start gap-3">
              <p class="text-sm">護石が登録されていません。</p>
              <Button type="button" variant="outline" class="h-11" @click="form?.focusRarity()">
                入力欄へ移動
              </Button>
            </div>
            <ul v-else class="rounded-md border">
              <CharmListItem
                v-for="entry in charms.entries"
                :key="entry.charm.id"
                :entry="entry"
                :editing="entry.charm.id === editingId"
                :deleting="charms.deletingIds.includes(entry.charm.id)"
                @edit="startEdit(entry.charm.id)"
                @remove="askDelete(entry)"
              />
            </ul>
          </template>
        </section>
      </div>
    </template>

    <DeleteConfirmDialog
      v-model:open="deleteOpen"
      title="護石を削除しますか？"
      :description="deleteDescription"
      @confirm="confirmDelete"
      @close-auto-focus="onDialogCloseAutoFocus"
    />
  </div>
</template>

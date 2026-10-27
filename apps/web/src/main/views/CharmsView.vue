<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CharmDeleteDialog from '@/components/charms/CharmDeleteDialog.vue'
import CharmForm from '@/components/charms/CharmForm.vue'
import CharmListItem from '@/components/charms/CharmListItem.vue'
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
const loading = computed(() => master.status === 'loading' || charms.status === 'loading')

// 読み込みが 300ms 未満で終わるときは、スケルトンを出さない（ちらつきを避ける）
const showSkeleton = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearSkeletonTimer(): void {
  if (skeletonTimer !== undefined) clearTimeout(skeletonTimer)
  skeletonTimer = undefined
}

watch(
  loading,
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
const formDisabledMessage = computed(() =>
  charms.status === 'failed'
    ? '護石を読み込めないため、護石を登録できません。'
    : '端末に保存できないため、護石を登録できません。',
)

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
  if ((await charms.remove(id)) !== 'saved') {
    focusAfterDialog = own
    return
  }
  if (editingId.value === id) editingId.value = null
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
    <h1 class="mb-4 text-xl leading-snug font-semibold">護石</h1>

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

    <div
      v-else
      class="flex flex-col gap-4 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-6"
    >
      <CharmForm
        ref="form"
        :editing="editing"
        :disabled="formDisabled"
        :disabled-message="formDisabledMessage"
        @saved="finishEdit"
        @cancel="finishEdit"
      />

      <section ref="listRoot" class="flex flex-col gap-2">
        <h2 ref="heading" tabindex="-1" class="text-base leading-snug font-semibold outline-none">
          登録済みの護石（{{ charms.charms.length }}）
        </h2>

        <div v-if="charms.status !== 'ready'" class="flex flex-col items-start gap-3">
          <ResultAlert
            tone="error"
            :title="charms.status === 'failed' ? '護石を読み込めません' : '護石を保存できません'"
          >
            <p>{{ charms.failureMessage }}</p>
            <p>
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
              @edit="startEdit(entry.charm.id)"
              @remove="askDelete(entry)"
            />
          </ul>
        </template>
      </section>
    </div>

    <CharmDeleteDialog
      v-model:open="deleteOpen"
      :summary="deleting === null ? '' : charmSummary(deleting.charm.payload, master.nameOf)"
      @confirm="confirmDelete"
      @close-auto-focus="onDialogCloseAutoFocus"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Cloud, Loader2, Smartphone } from '@lucide/vue'
import DeleteConfirmDialog from '@/components/common/DeleteConfirmDialog.vue'
import DeviceImportDialog from '@/components/common/DeviceImportDialog.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import WeaponForm from '@/components/weapons/WeaponForm.vue'
import WeaponListItem from '@/components/weapons/WeaponListItem.vue'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { weaponDisplayName, weaponTypeLabel } from '@/lib/weapons/convert'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'
import type { WeaponEntry } from '@/stores/weapons'
import { useWeaponsStore } from '@/stores/weapons'

const master = useMasterStore()
const weapons = useWeaponsStore()
const conditions = useConditionsStore()

const form = ref<InstanceType<typeof WeaponForm> | null>(null)
const heading = ref<HTMLElement | null>(null)
const listRoot = ref<HTMLElement | null>(null)
const editingId = ref<string | null>(null)
const deleting = ref<WeaponEntry | null>(null)
const deleteOpen = ref(false)
let focusAfterDialog: (() => void) | null = null

const editing = computed(
  () => weapons.weapons.find((weapon) => weapon.id === editingId.value) ?? null,
)
/** 最初の読み込みが終わるまでは画面全体を読込中にする。以降の読み直しは、フォームを残して一覧だけを読込中にする。 */
const initialLoad = ref(weapons.status === 'loading')
watch(
  () => weapons.status,
  (status) => {
    if (status !== 'loading') initialLoad.value = false
  },
)
const loading = computed(
  () => master.status === 'loading' || (initialLoad.value && weapons.status === 'loading'),
)
const listLoading = computed(() => weapons.status === 'loading')
const hasSource = computed(() => weapons.source !== 'unknown')
const isAccount = computed(() => weapons.source === 'account')
const showDeviceBand = computed(
  () => isAccount.value && weapons.deviceWeaponCount !== null && weapons.deviceWeaponCount > 0,
)

// 読み込みが 300ms 未満で終わるときは、スケルトンを出さない（ちらつきを避ける）
const showSkeleton = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearSkeletonTimer(): void {
  if (skeletonTimer !== undefined) clearTimeout(skeletonTimer)
  skeletonTimer = undefined
}

watch(
  () => master.status === 'loading' || weapons.status === 'loading',
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
  void weapons.ensureLoaded()
})
onBeforeUnmount(clearSkeletonTimer)

const formDisabled = computed(() => weapons.status !== 'ready')
const formDisabledMessage = computed(() =>
  weapons.status === 'failed'
    ? '個体差のある武器を読み込めないため、個体差のある武器を登録できません。'
    : '端末に保存できないため、個体差のある武器を登録できません。',
)

// ログアウト・401 で保存先が変わったら、編集のモードを終える（入力は捨てる。登録のモードの入力は残る）
watch(
  () => weapons.source,
  (source) => {
    if (source !== 'account') editingId.value = null
  },
)

/** 読み込み（読み直し・端末への切り替え）が終わるまで待つ。 */
function settled(): Promise<void> {
  if (weapons.status !== 'loading') return Promise.resolve()
  return new Promise((resolve) => {
    const stop = watch(
      () => weapons.status,
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
  void nextTick(() => form.value?.focusBase())
}

function finishEdit(): void {
  const id = editingId.value
  editingId.value = null
  if (id !== null) void nextTick(() => queryButton('data-edit-id', id)?.focus())
}

function askDelete(entry: WeaponEntry): void {
  deleting.value = entry
  deleteOpen.value = true
  focusAfterDialog = () => queryButton('data-delete-id', entry.weapon.id)?.focus()
}

/** 削除したあとのフォーカス: 次の行の削除 → 前の行の削除 → 一覧の見出し。 */
function focusTargetAfterRemove(id: string): () => void {
  const ids = weapons.weapons.map((weapon) => weapon.id)
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
  const id = target.weapon.id
  const own = focusAfterDialog
  focusAfterDialog = focusTargetAfterRemove(id)
  const result = await weapons.remove(id)
  if (result !== 'saved') {
    focusAfterDialog = own
    if (result === 'expired') await focusHeadingIfLost()
    return
  }
  if (editingId.value === id) editingId.value = null
  conditions.releaseWeapon(id)
}

const importButton = ref<InstanceType<typeof Button> | null>(null)
const importOpen = ref(false)

/** 取り込み中は押下を無視する（`disabled` にするとフォーカスが失われるため `aria-disabled` で無効にする）。 */
function askImport(): void {
  if (!weapons.importing) importOpen.value = true
}

async function confirmImport(): Promise<void> {
  await weapons.importFromDevice()
  await focusHeadingIfLost()
}

function onImportCloseAutoFocus(event: Event): void {
  event.preventDefault()
  void nextTick(() => (importButton.value?.$el as HTMLElement | undefined)?.focus())
}

function onDialogCloseAutoFocus(event: Event): void {
  event.preventDefault()
  const focus = focusAfterDialog
  focusAfterDialog = null
  void nextTick(() => focus?.())
}

/** 削除の確認に出す要約（表示名・武器種・攻撃力・会心率）。 */
const deleteSummary = computed(() => {
  const target = deleting.value
  if (target === null || master.bundle === null) return ''
  const ctx = { bundle: master.bundle, nameOf: master.nameOf }
  const { payload } = target.weapon
  const parts = [weaponDisplayName(payload, ctx), weaponTypeLabel(payload, ctx)]
  parts.push(`攻撃力 ${payload.attack}`, `会心 ${payload.affinity}%`)
  return parts.filter((part) => part !== null).join(' ／ ')
})

/** 削除の確認の本文。検索条件で選んでいる武器のときだけ、選択も外す旨を足す。 */
const deleteDescription = computed(() => {
  const selected = deleting.value !== null && conditions.isWeaponSelected(deleting.value.weapon.id)
  return `${deleteSummary.value}。削除すると元に戻せません。${
    isAccount.value ? '同じアカウントのほかの端末からも消えます。' : ''
  }${selected ? '検索条件の武器の選択も外します。' : ''}`
})
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <h1
      class="text-xl leading-snug font-bold"
      :class="loading || master.status === 'failed' || !hasSource ? 'mb-4' : 'mb-1'"
    >
      個体差のある武器
    </h1>

    <!-- 読込中 -->
    <div v-if="loading" class="flex flex-col gap-4">
      <template v-if="showSkeleton">
        <output class="block text-sm">武器とマスターデータを読み込んでいます…</output>
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
          この端末には、ログインしていないときに登録した個体差のある武器が
          {{ weapons.deviceWeaponCount }}
          件残っています。ログインしている間は表示せず、検索にも使いません。ログアウトすると、ふたたび表示します。
        </p>
        <Button
          ref="importButton"
          type="button"
          variant="outline"
          class="mt-2 h-11 aria-disabled:opacity-50"
          :aria-disabled="weapons.importing ? 'true' : undefined"
          @click="askImport"
        >
          <Loader2 v-if="weapons.importing" class="size-4 animate-spin" aria-hidden="true" />
          {{ weapons.importing ? '取り込み中…' : 'アカウントに取り込む' }}
        </Button>
      </ResultAlert>
      <div
        class="flex flex-col gap-4 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-6"
      >
        <WeaponForm
          ref="form"
          :editing="editing"
          :disabled="formDisabled"
          :disabled-message="formDisabledMessage"
          @saved="finishEdit"
          @cancel="finishEdit"
          @rejected="onRejected"
        />

        <section ref="listRoot" class="flex flex-col gap-2">
          <h2 ref="heading" tabindex="-1" class="text-base leading-snug font-bold outline-none">
            登録済みの武器（{{ weapons.weapons.length }}）
          </h2>

          <div v-if="listLoading" class="flex flex-col gap-2">
            <template v-if="showSkeleton">
              <output class="block text-sm">武器とマスターデータを読み込んでいます…</output>
              <Skeleton class="h-32 w-full" />
            </template>
          </div>

          <div v-else-if="weapons.status !== 'ready'" class="flex flex-col items-start gap-3">
            <ResultAlert
              tone="error"
              :title="
                weapons.status === 'failed'
                  ? '個体差のある武器を読み込めません'
                  : '個体差のある武器を保存できません'
              "
            >
              <p>{{ weapons.failureMessage }}</p>
              <p v-if="isAccount">
                通信の状態を確かめて、「再読み込み」を押してください。通常の武器での検索は引き続き使えます。
              </p>
              <p v-else-if="weapons.status === 'failed'">
                「再読み込み」を押してください。直らないときは、保存したデータが読み取れない状態です。通常の武器での検索は引き続き使えます。
              </p>
              <p v-else>
                ブラウザの設定でこのサイトのデータの保存を許可するか、プライベートブラウズをやめてから、「再読み込み」を押してください。通常の武器での検索は引き続き使えます。
              </p>
            </ResultAlert>
            <Button type="button" variant="outline" class="h-11" @click="weapons.reload()">
              再読み込み
            </Button>
          </div>

          <template v-else>
            <p v-if="weapons.excludedCount > 0" class="text-muted-foreground text-xs">
              検索の候補になるのは {{ weapons.candidateCount }} 件です。
            </p>
            <div v-if="weapons.weapons.length === 0" class="flex flex-col items-start gap-3">
              <p class="text-sm">個体差のある武器が登録されていません。</p>
              <Button type="button" variant="outline" class="h-11" @click="form?.focusBase()">
                入力欄へ移動
              </Button>
            </div>
            <ul v-else class="rounded-md border">
              <WeaponListItem
                v-for="entry in weapons.entries"
                :key="entry.weapon.id"
                :entry="entry"
                :editing="entry.weapon.id === editingId"
                :deleting="weapons.deletingIds.includes(entry.weapon.id)"
                @edit="startEdit(entry.weapon.id)"
                @remove="askDelete(entry)"
              />
            </ul>
          </template>
        </section>
      </div>
    </template>

    <DeviceImportDialog
      v-model:open="importOpen"
      noun="個体差のある武器"
      :count="weapons.deviceWeaponCount ?? 0"
      @confirm="confirmImport"
      @close-auto-focus="onImportCloseAutoFocus"
    />
    <DeleteConfirmDialog
      v-model:open="deleteOpen"
      title="個体差のある武器を削除しますか？"
      :description="deleteDescription"
      @confirm="confirmDelete"
      @close-auto-focus="onDialogCloseAutoFocus"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import WeaponDeleteDialog from '@/components/weapons/WeaponDeleteDialog.vue'
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
const loading = computed(() => master.status === 'loading' || weapons.status === 'loading')

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
  void weapons.ensureLoaded()
})
onBeforeUnmount(clearSkeletonTimer)

const formDisabled = computed(() => weapons.status !== 'ready')
const formDisabledMessage = computed(() =>
  weapons.status === 'failed'
    ? '個体差のある武器を読み込めないため、個体差のある武器を登録できません。'
    : '端末に保存できないため、個体差のある武器を登録できません。',
)

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
  if (!(await weapons.remove(id))) {
    focusAfterDialog = own
    return
  }
  if (editingId.value === id) editingId.value = null
  conditions.releaseWeapon(id)
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
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <h1 class="mb-4 text-xl leading-snug font-semibold">個体差のある武器</h1>

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

    <div
      v-else
      class="flex flex-col gap-4 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-6"
    >
      <WeaponForm
        ref="form"
        :editing="editing"
        :disabled="formDisabled"
        :disabled-message="formDisabledMessage"
        @saved="finishEdit"
        @cancel="finishEdit"
      />

      <section ref="listRoot" class="flex flex-col gap-2">
        <h2 ref="heading" tabindex="-1" class="text-base leading-snug font-semibold outline-none">
          登録済みの武器（{{ weapons.weapons.length }}）
        </h2>

        <div v-if="weapons.status !== 'ready'" class="flex flex-col items-start gap-3">
          <ResultAlert
            tone="error"
            :title="
              weapons.status === 'failed'
                ? '個体差のある武器を読み込めません'
                : '個体差のある武器を保存できません'
            "
          >
            <p>{{ weapons.failureMessage }}</p>
            <p>
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
              @edit="startEdit(entry.weapon.id)"
              @remove="askDelete(entry)"
            />
          </ul>
        </template>
      </section>
    </div>

    <WeaponDeleteDialog
      v-model:open="deleteOpen"
      :summary="deleteSummary"
      :selected="deleting !== null && conditions.isWeaponSelected(deleting.weapon.id)"
      @confirm="confirmDelete"
      @close-auto-focus="onDialogCloseAutoFocus"
    />
  </div>
</template>

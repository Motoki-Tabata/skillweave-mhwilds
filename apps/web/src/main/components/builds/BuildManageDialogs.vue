<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BuildNameDialog from '@/components/builds/BuildNameDialog.vue'
import DeleteConfirmDialog from '@/components/common/DeleteConfirmDialog.vue'
import type { Build } from '@/lib/api/builds'
import { useBuildsStore } from '@/stores/builds'
import type { BuildWriteResult } from '@/stores/builds'

/**
 * 保存した構成の名前の変更（D7）と削除の確認（D8）。S4・S5 が共有する。
 * 押したボタンは `data-rename-id`・`data-delete-id` で引き、閉じたときのフォーカスの戻し先にする。
 * 409・404・401 とログアウトのあとの行き先は、`renamed`・`removed` を受けた画面が決める。
 */
const emit = defineEmits<{
  renamed: [id: string, result: BuildWriteResult]
  removed: [id: string, result: BuildWriteResult]
}>()

const builds = useBuildsStore()

const target = ref<Build | null>(null)
const renameOpen = ref(false)
const deleteOpen = ref(false)
const saving = ref(false)
/** ダイアログを閉じたとき、押したボタンへフォーカスを戻すか */
let restoreFocus = true

// ログアウト・401 でログイン中でなくなったら、開いているダイアログを閉じる
watch(
  () => builds.status,
  (status) => {
    if (status !== 'loginRequired') return
    restoreFocus = false
    renameOpen.value = false
    deleteOpen.value = false
  },
)

function trigger(attribute: 'data-rename-id' | 'data-delete-id', id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${attribute}="${id}"]`)
}

function focusTrigger(attribute: 'data-rename-id' | 'data-delete-id', id: string): void {
  void nextTick(() => trigger(attribute, id)?.focus())
}

function askRename(build: Build): void {
  target.value = build
  restoreFocus = true
  renameOpen.value = true
}

function askDelete(build: Build): void {
  target.value = build
  restoreFocus = true
  deleteOpen.value = true
}

defineExpose({ askRename, askDelete })

/** 失敗（通信など）のときだけ入力を残して開いたままにする。それ以外は閉じる。 */
async function submitRename(name: string): Promise<void> {
  const build = target.value
  if (build === null) return
  saving.value = true
  const result = await builds.rename(build.id, name)
  saving.value = false
  const gone = !builds.builds.some((item) => item.id === build.id)
  if (result === 'failed' && !gone) return
  restoreFocus = result === 'saved'
  renameOpen.value = false
  emit('renamed', build.id, result)
}

function onRenameClosed(event: Event): void {
  event.preventDefault()
  if (restoreFocus && target.value !== null) focusTrigger('data-rename-id', target.value.id)
}

async function confirmDelete(): Promise<void> {
  const build = target.value
  if (build === null) return
  restoreFocus = false
  const result = await builds.remove(build.id)
  // 失敗したときは、元に戻った「削除」へフォーカスを戻す
  if (result === 'failed') focusTrigger('data-delete-id', build.id)
  emit('removed', build.id, result)
}

function onDeleteClosed(event: Event): void {
  event.preventDefault()
  if (restoreFocus && target.value !== null) focusTrigger('data-delete-id', target.value.id)
}
</script>

<template>
  <BuildNameDialog
    v-model:open="renameOpen"
    title="名前を変更"
    :description="`「${target?.name ?? ''}」の名前を変更します。`"
    :initial-name="target?.name ?? ''"
    :saving="saving"
    @submit="submitRename"
    @close-auto-focus="onRenameClosed"
  />
  <DeleteConfirmDialog
    v-model:open="deleteOpen"
    title="構成を削除しますか？"
    :description="`「${target?.name ?? ''}」を削除します。削除すると元に戻せません。同じアカウントのほかの端末からも消えます。`"
    @confirm="confirmDelete"
    @close-auto-focus="onDeleteClosed"
  />
</template>

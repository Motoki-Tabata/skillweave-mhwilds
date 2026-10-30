<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BuildDialogFrame from '@/components/builds/BuildDialogFrame.vue'
import ShareUrl from '@/components/shares/ShareUrl.vue'
import { Button } from '@/components/ui/button'
import type { Share } from '@/lib/api/shares'
import { shareUrl } from '@/lib/shares/url'
import { useAuthStore } from '@/stores/auth'
import { useSharesStore } from '@/stores/shares'

/**
 * 構成を共有するダイアログ（D9）。確認の段 → URL の表示の段の2段で進める。
 * 元の構成が無かった（404）ときは `notFound` を出して閉じる。閉じたあとのフォーカスは親が決める。
 */
const props = defineProps<{ open: boolean; buildId: string; buildName: string }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  notFound: []
  closeAutoFocus: [event: Event]
}>()

const CREATED_TEXT = '共有の URL を作りました。'
const EXISTING_TEXT =
  'この構成はすでに共有しています。前に作った URL を表示しています。共有した内容は、共有したときの名前と内容のままです。名前を変えた後の内容で共有し直すには、取り消してから、もう一度共有してください。'

const router = useRouter()
const auth = useAuthStore()
const shares = useSharesStore()

const sending = ref(false)
const result = ref<{ share: Share; created: boolean } | null>(null)
const urlPart = ref<InstanceType<typeof ShareUrl> | null>(null)

const url = computed(() =>
  result.value === null ? '' : shareUrl(router, result.value.share.shortId),
)
const resultText = computed(() => (result.value?.created === true ? CREATED_TEXT : EXISTING_TEXT))

// 開くたびに確認の段から始める
watch(
  () => props.open,
  (open) => {
    if (!open) return
    result.value = null
    sending.value = false
  },
)

// ログアウト・401 でログイン中でなくなったら閉じる
watch(
  () => auth.status,
  (status) => {
    if (status !== 'authenticated' && status !== 'checking') emit('update:open', false)
  },
)

function onUpdateOpen(value: boolean): void {
  // 応答を待つあいだは閉じない
  if (!value && sending.value) return
  emit('update:open', value)
}

/** 開いたら「URL を作成」にフォーカスを置く。 */
function onOpenAutoFocus(event: Event): void {
  event.preventDefault()
  void nextTick(() => document.querySelector<HTMLElement>('[data-share-submit]')?.focus())
}

async function onCreate(): Promise<void> {
  if (sending.value) return
  sending.value = true
  const outcome = await shares.create(props.buildId)
  sending.value = false
  if (!props.open) return
  if (outcome.result === 'created' || outcome.result === 'existing') {
    result.value = { share: outcome.share!, created: outcome.result === 'created' }
    await nextTick()
    urlPart.value?.focusCopy()
  } else if (outcome.result === 'notFound') {
    emit('update:open', false)
    emit('notFound')
  } else if (outcome.result === 'expired' || outcome.result === 'discarded') {
    emit('update:open', false)
  }
  // failed: 確認の段のまま開いておく（トーストはストアが出す）
}
</script>

<template>
  <BuildDialogFrame
    :open="open"
    title="構成を共有"
    :description="
      result === null
        ? `「${buildName}」の共有の URL を作ります。URL を知っている人は、ログインしなくてもこの構成を見られます。共有した後に、この構成の名前を変えたり削除したりしても、共有した内容は変わりません。`
        : resultText
    "
    :description-sr-only="result !== null"
    @update:open="onUpdateOpen"
    @open-auto-focus="onOpenAutoFocus"
    @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
  >
    <div v-if="result === null" class="flex justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        class="h-11"
        :disabled="sending"
        @click="onUpdateOpen(false)"
      >
        キャンセル
      </Button>
      <Button type="button" class="h-11" :disabled="sending" data-share-submit @click="onCreate">
        {{ sending ? '作成中…' : 'URL を作成' }}
      </Button>
    </div>
    <div v-else class="flex flex-col gap-3">
      <output class="block text-sm">{{ resultText }}</output>
      <ShareUrl ref="urlPart" :url="url" />
      <p class="text-xs">
        共有をやめるときは、「<RouterLink
          to="/shares"
          class="underline"
          @click="onUpdateOpen(false)"
          >共有した構成</RouterLink
        >」で取り消してください。
      </p>
      <div class="flex justify-end">
        <Button type="button" variant="outline" class="h-11" @click="onUpdateOpen(false)">
          閉じる
        </Button>
      </div>
    </div>
  </BuildDialogFrame>
</template>

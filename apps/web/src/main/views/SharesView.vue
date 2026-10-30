<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import LoginRequiredCard from '@/components/builds/LoginRequiredCard.vue'
import DeleteConfirmDialog from '@/components/common/DeleteConfirmDialog.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import ShareListItem from '@/components/shares/ShareListItem.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Share } from '@/lib/api/shares'
import { useSkeletonDelay } from '@/lib/useSkeletonDelay'
import { useSharesStore } from '@/stores/shares'

const shares = useSharesStore()

const LOGIN_MESSAGES = {
  unauthenticated: '共有した構成を見るには、Discord でログインしてください。',
  unavailable:
    'ログインの状態を確認できませんでした。共有した構成を見るには、Discord でログインしてください。',
}

const heading = ref<HTMLElement | null>(null)
const target = ref<Share | null>(null)
const confirmOpen = ref(false)
/** 確認ダイアログを閉じたとき、フォーカスを取り消しのボタンへ戻すか（確定したときは戻さない） */
let restoreFocus = true
/** 取り消したあとにフォーカスを移す行（次の行、無ければ前の行）の ID */
let neighborId: string | undefined

const showSkeleton = useSkeletonDelay(() => shares.status === 'loading')

onMounted(() => void shares.ensureLoaded())

// ログアウト・401 でログインが必要になったら、開いている確認を閉じる
watch(
  () => shares.status,
  (status) => {
    if (status !== 'loginRequired') return
    restoreFocus = false
    confirmOpen.value = false
  },
)

function focusLink(id: string | undefined): HTMLElement | null {
  if (id === undefined) return null
  return document.querySelector<HTMLElement>(`[data-name-id="${id}"]`)
}

function focusRevoke(id: string): void {
  void nextTick(() => document.querySelector<HTMLElement>(`[data-revoke-id="${id}"]`)?.focus())
}

function askRevoke(share: Share): void {
  const ids = shares.shares.map((item) => item.id)
  const index = ids.indexOf(share.id)
  neighborId = ids[index + 1] ?? ids[index - 1]
  target.value = share
  restoreFocus = true
  confirmOpen.value = true
}

async function confirmRevoke(): Promise<void> {
  const share = target.value
  if (share === null) return
  restoreFocus = false
  const result = await shares.revoke(share.id)
  await nextTick()
  if (result === 'revoked') (focusLink(neighborId) ?? heading.value)?.focus()
  else if (result === 'failed') focusRevoke(share.id)
}

function onClosed(event: Event): void {
  event.preventDefault()
  if (restoreFocus && target.value !== null) focusRevoke(target.value.id)
}
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <h1 ref="heading" tabindex="-1" class="mb-1 text-xl leading-snug font-bold outline-none">
      共有した構成
    </h1>

    <div v-if="shares.status === 'loading'" class="flex flex-col gap-2">
      <template v-if="showSkeleton">
        <output class="block text-sm">共有した構成を読み込んでいます…</output>
        <Skeleton class="h-28 w-full" />
        <Skeleton class="h-28 w-full" />
        <Skeleton class="h-28 w-full" />
      </template>
    </div>

    <LoginRequiredCard
      v-else-if="shares.status === 'loginRequired'"
      :reason="shares.loginRequiredReason"
      :messages="LOGIN_MESSAGES"
    />

    <div v-else-if="shares.status === 'failed'" class="flex flex-col items-start gap-3">
      <ResultAlert tone="error" title="共有した構成を読み込めません">
        <p>{{ shares.failureMessage }}</p>
        <p>通信の状態を確かめて、「再読み込み」を押してください。</p>
      </ResultAlert>
      <Button type="button" variant="outline" class="h-10" @click="shares.reload()">
        再読み込み
      </Button>
    </div>

    <template v-else>
      <p class="text-muted-foreground mb-4 text-xs">
        保存した構成から共有した URL です。URL
        を知っている人は、ログインしなくても構成を見られます。新しい順に並べています。
      </p>
      <div v-if="shares.shares.length === 0" class="flex flex-col items-start gap-3">
        <p class="text-sm">
          共有した構成はありません。保存した構成の画面で「共有」を押すと、ここに表示します。
        </p>
        <Button as-child variant="outline" class="h-10">
          <RouterLink to="/builds">保存した構成へ</RouterLink>
        </Button>
      </div>
      <section v-else class="flex flex-col gap-2">
        <h2 class="text-base leading-snug font-bold">共有した構成（{{ shares.shares.length }}）</h2>
        <ul
          :aria-label="`共有した構成（${shares.shares.length} 件）`"
          class="flex flex-col gap-2 lg:grid lg:grid-cols-2"
        >
          <ShareListItem
            v-for="share in shares.shares"
            :key="share.id"
            :share="share"
            :revoking="shares.revokingIds.includes(share.id)"
            @revoke="askRevoke(share)"
          />
        </ul>
      </section>
    </template>

    <DeleteConfirmDialog
      v-model:open="confirmOpen"
      title="共有を取り消しますか？"
      :description="`「${target?.name ?? ''}」の共有を取り消します。取り消すと、この URL では構成を見られなくなります。元に戻せません。もう一度共有すると、別の URL になります。`"
      confirm-label="共有を取り消す"
      @confirm="confirmRevoke"
      @close-auto-focus="onClosed"
    />
  </div>
</template>

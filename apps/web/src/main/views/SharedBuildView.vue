<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BuildCard from '@/components/search/BuildCard.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { SharedBuild } from '@/lib/api/shares'
import { savedMasterOf } from '@/lib/builds/savedMaster'
import { failureCauseText } from '@/lib/api/result'
import { formatDateTime } from '@/lib/format'
import { savedBuildView } from '@/lib/solver/buildView'
import { useSkeletonDelay } from '@/lib/useSkeletonDelay'
import { useMasterStore } from '@/stores/master'
import { useSharesStore } from '@/stores/shares'

/** 共有された構成（S7）。ログインの状態に依らず、共有だけを読んで表示する。 */
type SharedState =
  | { kind: 'loading' }
  | { kind: 'ready'; shared: SharedBuild }
  | { kind: 'notFound' }
  | { kind: 'failed'; cause: string }

const route = useRoute()
const master = useMasterStore()
const shares = useSharesStore()

const state = ref<SharedState>({ kind: 'loading' })
/** 読み込みを始めるたびに進める。古い応答を捨てる印 */
let seq = 0

async function load(): Promise<void> {
  const current = (seq += 1)
  state.value = { kind: 'loading' }
  const result = await shares.fetchShared(String(route.params.shortId))
  if (current !== seq) return
  if (result.kind === 'ok') state.value = { kind: 'ready', shared: result.value }
  else if (result.kind === 'notFound') state.value = { kind: 'notFound' }
  else state.value = { kind: 'failed', cause: failureCauseText(result) }
}

onMounted(() => {
  if (master.bundle === null) void master.load()
  void load()
})
watch(
  () => route.params.shortId,
  () => void load(),
)

type Phase = 'loading' | 'notFound' | 'failed' | 'masterFailed' | 'ready'

const phase = computed<Phase>(() => {
  const kind = state.value.kind
  if (kind === 'notFound' || kind === 'failed') return kind
  if (kind === 'loading' || master.status === 'loading') return 'loading'
  return master.status === 'failed' ? 'masterFailed' : 'ready'
})

const showSkeleton = useSkeletonDelay(() => phase.value === 'loading')

const shared = computed(() => (state.value.kind === 'ready' ? state.value.shared : null))
const view = computed(() => {
  const source = savedMasterOf(master)
  return shared.value === null || source === null ? null : savedBuildView(shared.value, source)
})

const headingText = computed(() => {
  if (phase.value === 'notFound') return '共有された構成が見つかりません'
  if (phase.value === 'ready' && shared.value !== null) return shared.value.name
  return '共有された構成'
})

const failureCause = computed(() => (state.value.kind === 'failed' ? state.value.cause : ''))

const conditionsText = computed(() => {
  const names = view.value?.conditions.map((condition) => condition.name) ?? []
  return names.length === 0 ? 'なし' : names.join('・')
})
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <h1 tabindex="-1" class="mb-3 text-xl leading-snug font-bold break-words outline-none">
      {{ headingText }}
    </h1>

    <div v-if="phase === 'loading'" class="flex flex-col gap-2">
      <template v-if="showSkeleton">
        <output class="block text-sm">共有された構成を読み込んでいます…</output>
        <Skeleton class="h-6 w-2/3" />
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-28 w-full" />
      </template>
    </div>

    <div v-else-if="phase === 'notFound'" class="flex flex-col items-start gap-3">
      <p class="text-sm">
        この共有は、取り消されたか、URL が間違っています。共有した人に URL を確かめてください。
      </p>
      <Button as-child variant="outline" class="h-10">
        <RouterLink to="/">装備検索へ</RouterLink>
      </Button>
    </div>

    <div v-else-if="phase === 'failed'" class="flex flex-col items-start gap-3">
      <ResultAlert tone="error" title="共有された構成を読み込めません">
        <p>{{ failureCause }}</p>
        <p>通信の状態を確かめて、「再読み込み」を押してください。</p>
      </ResultAlert>
      <Button type="button" variant="outline" class="h-10" @click="load()">再読み込み</Button>
    </div>

    <div v-else-if="phase === 'masterFailed'" class="flex flex-col items-start gap-3">
      <ResultAlert tone="error" title="データを読み込めませんでした">
        <p>{{ master.failureMessage }}</p>
        <p>通信状況を確かめて、「再読み込み」を押してください。</p>
      </ResultAlert>
      <Button type="button" class="h-10" @click="master.load()">再読み込み</Button>
    </div>

    <div v-else-if="shared !== null && view !== null" class="flex flex-col gap-4">
      <p class="text-muted-foreground text-xs">
        共有された構成です。共有したときの内容を表示しています。
      </p>
      <dl class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2 gap-y-1">
        <dt class="text-muted-foreground text-xs">武器</dt>
        <dd class="text-sm break-words">{{ view.weaponName }}</dd>
        <dt class="text-muted-foreground text-xs">発動条件</dt>
        <dd class="text-sm break-words">{{ conditionsText }}</dd>
        <dt class="text-muted-foreground text-xs">共有</dt>
        <dd class="font-num text-sm tabular-nums">{{ formatDateTime(shared.createdAt) }}</dd>
        <dt class="text-muted-foreground text-xs">マスターの版</dt>
        <dd class="font-num text-sm tabular-nums break-all">{{ view.masterVersion }}</dd>
      </dl>
      <ResultAlert v-if="view.versionDiffers" tone="warning">
        <p>
          この構成は、マスターデータの版
          <span class="font-num tabular-nums">{{ view.masterVersion }}</span>
          で作られています。いまの版は
          <span class="font-num tabular-nums">{{ view.currentMasterVersion }}</span>
          です。名前・防御力・火力などの表示が、作られたときと異なる場合があります。
        </p>
      </ResultAlert>
      <BuildCard
        :build="view.solved"
        title="構成の内容"
        :heading-level="2"
        :lookup="view.lookup"
        :damage="{
          base: view.damageBase,
          skills: view.damageSkills,
          conditionIds: view.damageConditionIds,
        }"
        show-charm
      />
    </div>
  </div>
</template>

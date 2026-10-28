<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ChevronLeft } from '@lucide/vue'
import BuildManageDialogs from '@/components/builds/BuildManageDialogs.vue'
import BuildsGate from '@/components/builds/BuildsGate.vue'
import BuildCard from '@/components/search/BuildCard.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { savedMasterOf } from '@/lib/builds/savedMaster'
import { formatDateTime } from '@/lib/format'
import { savedBuildView } from '@/lib/solver/buildView'
import { useBuildsStore } from '@/stores/builds'
import type { BuildWriteResult } from '@/stores/builds'
import { useMasterStore } from '@/stores/master'

const route = useRoute()
const router = useRouter()
const master = useMasterStore()
const builds = useBuildsStore()

const heading = ref<HTMLElement | null>(null)
const dialogs = ref<InstanceType<typeof BuildManageDialogs> | null>(null)

const build = computed(() => builds.builds.find((item) => item.id === route.params.id) ?? null)
const view = computed(() => {
  const source = savedMasterOf(master)
  return build.value === null || source === null ? null : savedBuildView(build.value, source)
})
const deleting = computed(() => build.value !== null && builds.deletingIds.includes(build.value.id))

const headingText = computed(() => {
  if (builds.status !== 'ready') return '保存した構成'
  return build.value?.name ?? '構成が見つかりません'
})

const conditionsText = computed(() => {
  const names = view.value?.conditions.map((condition) => condition.name) ?? []
  return names.length === 0 ? 'なし' : names.join('・')
})

function focusHeadingIfLost(): void {
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) heading.value?.focus()
}

/** 409・404 のあとは読み直しが済んでいる。h1 へ移す（404 は「見つかりません」になる）。 */
async function onRenamed(_id: string, result: BuildWriteResult): Promise<void> {
  if (result === 'saved') return
  await nextTick()
  if (result === 'conflict' || result === 'notFound') heading.value?.focus()
  else focusHeadingIfLost()
}

/** 削除に成功したら一覧へ移り、一覧の h1 にフォーカスを置く。 */
async function onRemoved(_id: string, result: BuildWriteResult): Promise<void> {
  if (result === 'failed') return
  if (result === 'saved') {
    await router.push('/builds')
    await nextTick()
    document.querySelector<HTMLElement>('h1')?.focus()
    return
  }
  await nextTick()
  focusHeadingIfLost()
}
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <Button as-child variant="ghost" class="-ml-3 h-11 gap-1">
      <RouterLink to="/builds">
        <ChevronLeft class="size-4" aria-hidden="true" />
        保存した構成の一覧へ
      </RouterLink>
    </Button>
    <h1
      ref="heading"
      tabindex="-1"
      class="mb-3 text-xl leading-snug font-bold break-words outline-none"
    >
      {{ headingText }}
    </h1>

    <BuildsGate>
      <p v-if="build === null || view === null" class="text-sm">
        この構成は、削除されたか、別のアカウントで保存されたものです。
      </p>
      <div v-else class="flex flex-col gap-4">
        <dl class="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2 gap-y-1">
          <dt class="text-muted-foreground text-xs">武器</dt>
          <dd class="text-sm break-words">{{ view.weaponName }}</dd>
          <dt class="text-muted-foreground text-xs">発動条件</dt>
          <dd class="text-sm break-words">{{ conditionsText }}</dd>
          <dt class="text-muted-foreground text-xs">保存</dt>
          <dd class="font-num text-sm tabular-nums">{{ formatDateTime(build.createdAt) }}</dd>
          <dt class="text-muted-foreground text-xs">マスターの版</dt>
          <dd class="font-num text-sm tabular-nums break-all">{{ view.masterVersion }}</dd>
        </dl>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            class="h-10"
            :aria-label="`${build.name} の名前を変更`"
            :disabled="deleting"
            :data-rename-id="build.id"
            @click="dialogs?.askRename(build)"
          >
            名前を変更
          </Button>
          <Button
            type="button"
            variant="outline"
            class="text-destructive border-destructive hover:text-destructive h-10"
            :aria-label="`${build.name} を削除`"
            :disabled="deleting"
            :data-delete-id="build.id"
            @click="dialogs?.askDelete(build)"
          >
            {{ deleting ? '削除中…' : '削除' }}
          </Button>
        </div>
        <ResultAlert v-if="view.versionDiffers" tone="warning">
          <p>
            この構成は、マスターデータの版
            <span class="font-num tabular-nums">{{ view.masterVersion }}</span>
            で保存しました。いまの版は
            <span class="font-num tabular-nums">{{ view.currentMasterVersion }}</span>
            です。名前・防御力・火力などの表示が、保存したときと異なる場合があります。
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
    </BuildsGate>

    <BuildManageDialogs ref="dialogs" @renamed="onRenamed" @removed="onRemoved" />
  </div>
</template>

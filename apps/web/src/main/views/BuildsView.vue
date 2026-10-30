<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import BuildListItem from '@/components/builds/BuildListItem.vue'
import BuildManageDialogs from '@/components/builds/BuildManageDialogs.vue'
import BuildsGate from '@/components/builds/BuildsGate.vue'
import { Button } from '@/components/ui/button'
import type { Build } from '@/lib/api/builds'
import { useBuildsStore } from '@/stores/builds'
import type { BuildWriteResult } from '@/stores/builds'

const builds = useBuildsStore()

const heading = ref<HTMLElement | null>(null)
const dialogs = ref<InstanceType<typeof BuildManageDialogs> | null>(null)
/** 削除したあとにフォーカスを移す行（次の行、無ければ前の行）の ID */
let neighborId: string | undefined

function nameLink(id: string | undefined): HTMLElement | null {
  if (id === undefined) return null
  return document.querySelector<HTMLElement>(`[data-name-id="${id}"]`)
}

/** フォーカスが失われている（押したボタンが消えた）ときだけ、h1 へ移す。 */
function focusHeadingIfLost(): void {
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) heading.value?.focus()
}

function askRemove(build: Build): void {
  const ids = builds.builds.map((item) => item.id)
  const index = ids.indexOf(build.id)
  neighborId = ids[index + 1] ?? ids[index - 1]
  dialogs.value?.askDelete(build)
}

/** 409・404 のあとは、読み直しが済んでいる。その構成の名前のリンク（無ければ h1）へ移す。 */
async function onRenamed(id: string, result: BuildWriteResult): Promise<void> {
  if (result === 'saved') return
  await nextTick()
  if (result === 'conflict' || result === 'notFound') (nameLink(id) ?? heading.value)?.focus()
  else focusHeadingIfLost()
}

async function onRemoved(_id: string, result: BuildWriteResult): Promise<void> {
  if (result === 'failed') return
  await nextTick()
  if (result === 'saved') (nameLink(neighborId) ?? heading.value)?.focus()
  else focusHeadingIfLost()
}
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <h1 ref="heading" tabindex="-1" class="mb-1 text-xl leading-snug font-bold outline-none">
      保存した構成
    </h1>

    <BuildsGate>
      <p class="text-muted-foreground mb-4 text-xs">
        装備検索の結果から保存した構成です。新しい順に並べています。
      </p>
      <div v-if="builds.builds.length === 0" class="flex flex-col items-start gap-3">
        <p class="text-sm">
          保存した構成はありません。装備検索の結果で「保存」を押すと、ここに表示します。
        </p>
        <Button as-child variant="outline" class="h-10">
          <RouterLink to="/">装備検索へ</RouterLink>
        </Button>
      </div>
      <section v-else class="flex flex-col gap-2">
        <h2 class="text-base leading-snug font-bold">保存した構成（{{ builds.builds.length }}）</h2>
        <ul
          :aria-label="`保存した構成（${builds.builds.length} 件）`"
          class="flex flex-col gap-2 lg:grid lg:grid-cols-2"
        >
          <BuildListItem
            v-for="build in builds.builds"
            :key="build.id"
            :build="build"
            :deleting="builds.deletingIds.includes(build.id)"
            @rename="dialogs?.askRename(build)"
            @remove="askRemove(build)"
          />
        </ul>
      </section>
    </BuildsGate>

    <BuildManageDialogs ref="dialogs" @renamed="onRenamed" @removed="onRemoved" />
  </div>
</template>

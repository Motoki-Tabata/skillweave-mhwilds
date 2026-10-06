<script setup lang="ts">
// マスターの取得を待たずに参照できるよう、ビルド時に埋め込んだ値を使う
const { repository, commit } = __SWV_MASTER__.source

const prefix = '出典: '
const suffix = ` @${commit.slice(0, 7)}`
const fullText = `マスターデータの出典: MHDB ${repository} コミット ${commit}`
</script>

<template>
  <footer
    class="bg-background fixed inset-x-0 bottom-0 z-40 flex h-8 items-center border-t px-4 text-xs md:px-6"
    :title="fullText"
    :aria-label="fullText"
  >
    <!-- 1行に収まらないときは、リポジトリ名だけを省略記号で切り詰める（コミットは切り詰めない） -->
    <span class="shrink-0 whitespace-pre">{{ prefix }}</span>
    <span class="min-w-20 truncate">{{ repository }}</span>
    <span class="shrink-0 whitespace-pre">{{ suffix }}</span>
  </footer>
</template>

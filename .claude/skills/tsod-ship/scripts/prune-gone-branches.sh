#!/usr/bin/env bash
# リモートが削除済み（upstream が [gone]）で、PR が MERGED のローカルブランチを削除する。
#
# 使い方（リポジトリ内のどこからでも可）:
#   bash .claude/skills/tsod-ship/scripts/prune-gone-branches.sh
#
# マージ後のブランチ掃除は、この入口だけを使う（個別の git コマンドを直接叩かない）。
#
# 削除の基準: `gh pr view` が state=MERGED を返したブランチだけ `git branch -D` する。
# リモートでマージ済みでもローカルの main に未取込だと `git branch -d` が拒否されるため -D を使うが、MERGED を確認した
# ブランチに限るので未マージの作業は消えない。PR が無い・OPEN・CLOSED・gh 失敗のブランチは残す。
# 判断が要るブランチは、対象を選んで手で削除する。
#
# 終了コード: 正常終了（削除対象なし・一部を残した場合を含む）は 0、実行自体の失敗は 1。
set -euo pipefail

die() { echo "エラー: $*" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || die "gh が見つからない。MERGED を確認できないため何も削除しない"
gh auth status >/dev/null 2>&1 || die "gh が未認証。MERGED を確認できないため何も削除しない"

cd "$(git rev-parse --show-toplevel)"
git fetch origin --prune --quiet

CURRENT="$(git symbolic-ref --quiet --short HEAD || true)"
deleted=0
kept=0

# upstream が消えたローカルブランチ。main は常に対象外（防御的ガード）。
mapfile -t GONE < <(
  git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads |
    awk '$2 == "[gone]" && $1 != "main" {print $1}'
)

for branch in "${GONE[@]}"; do
  state="$(gh pr view "$branch" --json state --jq .state 2>/dev/null || true)"
  if [[ "$state" != "MERGED" ]]; then
    echo "残す: $branch（PR state=${state:-なし}）"
    kept=$((kept + 1))
    continue
  fi

  if [[ "$branch" == "$CURRENT" ]]; then
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "残す: $branch（チェックアウト中で未コミットの変更あり。main へ切り替えてから再実行）"
      kept=$((kept + 1))
      continue
    fi
    git switch --quiet main
    git pull --quiet --ff-only
  fi

  git branch -D "$branch" >/dev/null
  echo "削除: $branch（PR state=MERGED）"
  deleted=$((deleted + 1))
done

if ((deleted == 0 && kept == 0)); then
  echo "削除対象なし"
fi

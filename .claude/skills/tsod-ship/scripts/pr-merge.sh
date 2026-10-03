#!/usr/bin/env bash
# PR を merge commit でマージし、リモートのブランチを削除して、main へ切り替えて最新にする（区間 E）。
# メインだけが実行する（許可リストには入れない）。
#
# 使い方（リポジトリ内のどこからでも可）:
#   bash .claude/skills/tsod-ship/scripts/pr-merge.sh <PR 番号> [--dry-run]
#
# 動作: `gh pr merge <番号> --merge --delete-branch` の後、`git switch main && git pull --ff-only`。
# --dry-run は実行するコマンドを表示するだけ。
#
# 終了コード: 0 成功／1 失敗／2 引数誤り。
set -euo pipefail

usage() {
  echo "使い方: pr-merge.sh <PR 番号> [--dry-run]" >&2
}

PR=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --*) echo "不明な引数です: $1" >&2; usage; exit 2 ;;
    *)
      [[ -z "$PR" ]] || { usage; exit 2; }
      PR="$1"
      shift
      ;;
  esac
done

[[ -n "$PR" && "$PR" =~ ^[0-9]+$ ]] || { usage; exit 2; }

cd "$(git rev-parse --show-toplevel)"

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ $*"
  else
    "$@"
  fi
}

run gh pr merge "$PR" --merge --delete-branch
run git switch main
run git pull --ff-only

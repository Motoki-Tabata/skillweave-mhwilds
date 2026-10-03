#!/usr/bin/env bash
# 現在のブランチを push し、PR を作る（区間 E）。メインだけが実行する（許可リストには入れない）。
#
# 使い方（リポジトリ内のどこからでも可）:
#   bash .claude/skills/tsod-ship/scripts/pr-open.sh <本文ファイル> [--title <題>]
#   bash .claude/skills/tsod-ship/scripts/pr-open.sh --push-only      # push だけ
#   bash .claude/skills/tsod-ship/scripts/pr-open.sh <本文ファイル> --dry-run   # 実行するコマンドを表示するだけ
#
# 動作: `git push -u origin HEAD` の後、`gh pr create --base main --body-file <本文ファイル>` で PR を作り、
# PR 番号だけを標準出力に出す。main ブランチ上では拒否する。
# 題の既定は、直近のコミットの題。
#
# 終了コード: 0 成功／1 失敗（main 上・push や gh の失敗）／2 引数誤り。
set -euo pipefail

usage() {
  echo "使い方: pr-open.sh <本文ファイル> [--title <題>] [--dry-run] | pr-open.sh --push-only [--dry-run]" >&2
}

BODY=""
TITLE=""
PUSH_ONLY=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      TITLE="$2"
      shift 2
      ;;
    --push-only) PUSH_ONLY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --*) echo "不明な引数です: $1" >&2; usage; exit 2 ;;
    *)
      [[ -z "$BODY" ]] || { echo "本文ファイルは1つだけ指定してください" >&2; usage; exit 2; }
      BODY="$1"
      shift
      ;;
  esac
done

if [[ "$PUSH_ONLY" -eq 0 ]]; then
  [[ -n "$BODY" ]] || { usage; exit 2; }
  [[ -f "$BODY" ]] || { echo "本文ファイルが見つかりません: $BODY" >&2; exit 2; }
fi

cd "$(git rev-parse --show-toplevel)"

BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" ]]; then
  echo "エラー: ブランチ上にいません（detached HEAD）" >&2
  exit 1
fi
if [[ "$BRANCH" == "main" ]]; then
  echo "エラー: main ブランチ上では push・PR 作成をしません。作業ブランチへ切り替えてください" >&2
  exit 1
fi

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ $*"
  else
    "$@"
  fi
}

run git push -u origin HEAD >&2

if [[ "$PUSH_ONLY" -eq 1 ]]; then
  exit 0
fi

if [[ -z "$TITLE" ]]; then
  TITLE="$(git log -1 --pretty=%s)"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "+ gh pr create --base main --title \"$TITLE\" --body-file \"$BODY\""
  exit 0
fi

gh pr create --base main --title "$TITLE" --body-file "$BODY" >&2
gh pr view --json number --jq .number

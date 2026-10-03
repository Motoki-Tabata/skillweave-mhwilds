#!/usr/bin/env bash
# PR の CI 完了を待つ（読み取りと待ちだけ）。Bash の run_in_background で起動し、完了通知を待つ。
#
# 使い方（リポジトリ内のどこからでも可）:
#   bash .claude/skills/tsod-ship/scripts/ci-wait.sh <PR 番号> [--log <パス>]
#
# `gh pr checks <番号> --watch` の出力をログファイル（既定 ${TMPDIR:-/tmp}/tsod-ci/<番号>.log）へリダイレクトし、
# 終了コードで判定する（jq 等の外部コマンドに判定を依存させない）。
# `no checks reported` のときは、チェックの登録待ちとして 10 秒間隔で最大 6 回取り直す。それでも無ければ
# `gh run list --branch <ブランチ> --limit 5` でワークフローの起動を確かめ、起動していなければ「CI が起動していない」とする
# （緑とみなさない）。
# 標準出力には要約行（結果・失敗したチェック名・ログのパス）だけを出す。
#
# 終了コード: 0 緑／1 失敗／2 引数誤り／3 未起動（チェックが登録されない）。
set -uo pipefail

usage() {
  echo "使い方: ci-wait.sh <PR 番号> [--log <パス>]" >&2
}

PR=""
LOG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log)
      [[ $# -ge 2 ]] || { usage; exit 2; }
      LOG="$2"
      shift 2
      ;;
    --*) echo "不明な引数です: $1" >&2; usage; exit 2 ;;
    *)
      [[ -z "$PR" ]] || { usage; exit 2; }
      PR="$1"
      shift
      ;;
  esac
done

[[ -n "$PR" && "$PR" =~ ^[0-9]+$ ]] || { usage; exit 2; }

if [[ -z "$LOG" ]]; then
  LOG="${TMPDIR:-/tmp}/tsod-ci/${PR}.log"
fi
mkdir -p "$(dirname "$LOG")"

MAX_RETRY=6
INTERVAL=10
attempt=0
code=0

while true; do
  gh pr checks "$PR" --watch >"$LOG" 2>&1
  code=$?
  if grep -q 'no checks reported' "$LOG"; then
    if [[ "$attempt" -lt "$MAX_RETRY" ]]; then
      attempt=$((attempt + 1))
      sleep "$INTERVAL"
      continue
    fi
    BRANCH="$(gh pr view "$PR" --json headRefName --jq .headRefName 2>/dev/null || true)"
    RUNS=""
    if [[ -n "$BRANCH" ]]; then
      RUNS="$(gh run list --branch "$BRANCH" --limit 5 2>/dev/null || true)"
    fi
    if [[ -z "$RUNS" ]]; then
      echo "結果: 未起動（CI が起動していない。緑とみなさない）"
    else
      echo "結果: 未起動（ワークフローの実行はあるが、チェックが登録されない。緑とみなさない）"
    fi
    echo "ログ: $LOG"
    exit 3
  fi
  break
done

if [[ "$code" -eq 0 ]]; then
  echo "結果: 緑"
  echo "ログ: $LOG"
  exit 0
fi

# 失敗したチェック名（`gh pr checks` の出力は、名前・状態・時間・URL をタブ区切りで並べる）。
FAILED="$(awk -F'\t' '$2 == "fail" {print $1}' "$LOG" | paste -sd, - || true)"
echo "結果: 失敗（gh pr checks の終了コード $code）"
echo "失敗したチェック: ${FAILED:-（ログで確認）}"
echo "ログ: $LOG"
exit 1

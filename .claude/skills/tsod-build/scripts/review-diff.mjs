#!/usr/bin/env node
// review-diff: コミット範囲の差分をファイルへ保存し、パスと変更の要約（領域別のファイル数を含む）だけを標準出力に出す。
// 差分の全文をメインの文脈に通さないための道具（reviewer-agent には保存したファイルのパスを渡す）。
//
// 使い方（リポジトリ root で実行）:
//   node .claude/skills/tsod-build/scripts/review-diff.mjs <base> [<head>=HEAD]
//
// 保存先: ${TMPDIR:-/tmp}/tsod-review/<base 先頭7桁>-<head 先頭7桁>.diff
// 終了コード: 0 成功／2 引数誤り・git の失敗。
// Node ESM・依存ゼロ。純関数（引数解析・パスの組み立て・要約の解析・領域の分類）を export する。

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const USAGE = '使い方: node review-diff.mjs <base> [<head>=HEAD]';

// 差分の分類に使う領域。順序が要約の表示順になる。領域の語彙は spec.md「影響範囲」の「触る領域」と同じ。
export const OTHER_AREA = 'その他';
export const AREAS = [
  ['api', /^apps\/api\//],
  ['web', /^apps\/web\//],
  ['solver', /^packages\/solver\//],
  ['data', /^packages\/data\//],
  ['contracts', /^contracts\//],
  ['docker', /^docker\//],
];

/**
 * 引数を解析する。純関数。不正な引数は Error を投げる。
 */
export function parseArgs(argv) {
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      throw new Error(`不明な引数です: ${arg}`);
    }
    positional.push(arg);
  }
  if (positional.length < 1 || positional.length > 2) {
    throw new Error('引数は <base> [<head>] の1〜2個です');
  }
  return { base: positional[0], head: positional[1] ?? 'HEAD' };
}

function shortId(ref) {
  return String(ref).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 7);
}

/**
 * 差分ファイルの保存先を組み立てる。純関数。
 */
export function buildOutputPath(base, head, tmpDir = process.env.TMPDIR || os.tmpdir()) {
  return path.join(tmpDir, 'tsod-review', `${shortId(base)}-${shortId(head)}.diff`);
}

/**
 * `git diff --shortstat` の出力から件数を取り出す。純関数。
 * 差分が無ければ全て 0。
 */
export function parseShortstat(text) {
  const s = String(text ?? '');
  const num = (re) => {
    const m = s.match(re);
    return m ? Number(m[1]) : 0;
  };
  return {
    files: num(/(\d+)\s+files?\s+changed/),
    insertions: num(/(\d+)\s+insertions?\(\+\)/),
    deletions: num(/(\d+)\s+deletions?\(-\)/),
  };
}

/**
 * 変更ファイルのパス（リポジトリ root からの相対）を領域に分類する。純関数。
 * api・web・solver・data・contracts・docker のどれにも当たらないものは「その他」（共有構成ファイル・specs・design など）。
 */
export function classifyPath(filePath) {
  const p = String(filePath).replace(/\\/g, '/');
  for (const [area, re] of AREAS) {
    if (re.test(p)) return area;
  }
  return OTHER_AREA;
}

/**
 * 変更ファイルのパス一覧から、領域別のファイル数を数える。純関数。
 * 表示順は AREAS の順で、最後が「その他」。0件の領域は含めない。
 * @returns {{area: string, count: number}[]}
 */
export function summarizeAreas(paths) {
  const counts = new Map();
  for (const p of paths) {
    const area = classifyPath(p);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...AREAS.map(([area]) => area), OTHER_AREA].filter((a) => counts.has(a)).map((area) => ({ area, count: counts.get(area) }));
}

/**
 * 領域別のファイル数を1行にする。純関数。
 */
export function formatAreas(summary) {
  if (summary.length === 0) return '領域別: なし';
  return `領域別: ${summary.map((s) => `${s.area} ${s.count}`).join(' / ')}`;
}

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exit(2);
  }

  // 範囲の端点をコミットのハッシュに解決する（ブランチ名や HEAD でも保存先が一意になる）。
  const resolved = [];
  for (const ref of [opts.base, opts.head]) {
    const r = git(['rev-parse', '--verify', `${ref}^{commit}`]);
    if (r.status !== 0) {
      console.error(`コミットを解決できません: ${ref}`);
      process.exit(2);
    }
    resolved.push(r.stdout.trim());
  }
  const [baseHash, headHash] = resolved;

  const diff = git(['diff', `${baseHash}..${headHash}`]);
  if (diff.status !== 0) {
    console.error(`git diff に失敗しました: ${diff.stderr}`);
    process.exit(2);
  }
  const stat = git(['diff', '--shortstat', `${baseHash}..${headHash}`]);
  if (stat.status !== 0) {
    console.error(`git diff --shortstat に失敗しました: ${stat.stderr}`);
    process.exit(2);
  }
  const names = git(['diff', '--name-only', `${baseHash}..${headHash}`]);
  if (names.status !== 0) {
    console.error(`git diff --name-only に失敗しました: ${names.stderr}`);
    process.exit(2);
  }

  const out = buildOutputPath(baseHash, headHash);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, diff.stdout);

  const counts = parseShortstat(stat.stdout);
  console.log(`差分ファイル: ${out}`);
  console.log(`範囲: ${baseHash.slice(0, 7)}..${headHash.slice(0, 7)}`);
  console.log(`変更ファイル数: ${counts.files} / 追加 ${counts.insertions} 行 / 削除 ${counts.deletions} 行`);
  console.log(formatAreas(summarizeAreas(names.stdout.split('\n').filter(Boolean))));
  process.exit(0);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}

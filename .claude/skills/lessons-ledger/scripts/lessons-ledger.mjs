#!/usr/bin/env node
// lessons-ledger.mjs
// canon の配置時に tasks/lessons.md（教訓台帳）を照合し、反映済みの項目だけを削除する。
//   node lessons-ledger.mjs check [--root <dir>]
//   node lessons-ledger.mjs apply [--root <dir>] [--accept-additions]
// 終了コード: 0 = 一致（未適用）・適用済み・反映済みの項目が0件 / 1 = 台帳がスナップショットと違う / 2 = 実行不能
// 反映済みの項目が0件（reflection.json の entries が空）のときは、台帳の有無・中身によらず何もせず終了コード 0 で終わる。
// Node 組込みモジュールのみ。import しただけでは何も実行しない（直接実行のときだけ main が走る）。

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REFLECTION = path.resolve(HERE, '..', 'reflection.json');
const DEFAULT_SNAPSHOT = path.resolve(HERE, '..', 'ledger-snapshot.txt');

/**
 * 台帳を前置きと項目に分ける。行頭 "## " で項目を区切る。
 * 前置き + 各項目の text を結合すると元の text に戻る。
 * @param {string} text
 * @returns {{ preamble: string, entries: { heading: string, text: string }[] }}
 */
export function parseLedger(text) {
  const lines = text.split(/(?<=\n)/).filter((l) => l !== '');
  let preamble = '';
  const entries = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      entries.push({ heading: line.replace(/\r?\n$/, ''), text: line });
    } else if (entries.length === 0) {
      preamble += line;
    } else {
      entries[entries.length - 1].text += line;
    }
  }
  return { preamble, entries };
}

/**
 * 現在の台帳とスナップショットを比べる。
 * @param {string} currentText
 * @param {string} snapshotText
 */
export function compareLedger(currentText, snapshotText) {
  const cur = parseLedger(currentText);
  const snap = parseLedger(snapshotText);
  const curMap = new Map(cur.entries.map((e) => [e.heading, e.text]));
  const snapMap = new Map(snap.entries.map((e) => [e.heading, e.text]));
  const added = cur.entries.filter((e) => !snapMap.has(e.heading)).map((e) => e.heading);
  const removed = snap.entries.filter((e) => !curMap.has(e.heading)).map((e) => e.heading);
  const lastSnapHeading = snap.entries.length > 0 ? snap.entries[snap.entries.length - 1].heading : null;
  const changed = snap.entries
    .filter((e) => {
      if (!curMap.has(e.heading)) return false;
      const c = curMap.get(e.heading);
      // スナップショット最後の項目だけは、追記との境界の空白の差を許す（appendOnly と同じ扱い）
      return e.heading === lastSnapHeading ? c.trimEnd() !== e.text.trimEnd() : c !== e.text;
    })
    .map((e) => e.heading);
  const equal = currentText === snapshotText;

  let appendOnly = false;
  if (!equal && cur.preamble === snap.preamble && cur.entries.length > snap.entries.length) {
    appendOnly = snap.entries.every((e, i) => {
      const c = cur.entries[i];
      if (c.heading !== e.heading) return false;
      // 最後のスナップショット項目だけは、追記との境界の空白の差を許す
      return i === snap.entries.length - 1 ? c.text.trimEnd() === e.text.trimEnd() : c.text === e.text;
    });
  }
  return { equal, added, removed, changed, appendOnly };
}

/**
 * 反映済み見出しの項目を取り除く。他の項目と前置きは逐語で残す。
 * @param {string} ledgerText
 * @param {string[]} reflectedHeadings
 * @returns {string}
 */
export function applyReflection(ledgerText, reflectedHeadings) {
  const set = new Set(reflectedHeadings);
  const { preamble, entries } = parseLedger(ledgerText);
  const result = preamble + entries.filter((e) => !set.has(e.heading)).map((e) => e.text).join('');
  return result.trim() === '' ? '' : result;
}

/**
 * 次に取るべき動作を決める。
 * @param {{ current: string|null, snapshot: string, reflectedHeadings: string[], acceptAdditions?: boolean }} args
 * @returns {{ kind: 'unapplied'|'applied'|'mismatch'|'invalid', next: string|null, diff: object|null }}
 */
export function planAction({ current, snapshot, reflectedHeadings, acceptAdditions = false }) {
  const snapHeadings = new Set(parseLedger(snapshot).entries.map((e) => e.heading));
  const missing = reflectedHeadings.filter((h) => !snapHeadings.has(h));
  if (missing.length > 0) {
    return { kind: 'invalid', next: null, diff: { added: [], removed: [], changed: [], missing } };
  }
  const expected = applyReflection(snapshot, reflectedHeadings);
  const cur = current === null ? '' : current;
  if (current !== null && current === snapshot) {
    return { kind: 'unapplied', next: expected, diff: null };
  }
  if (expected === '' ? cur === '' : current === expected) {
    return { kind: 'applied', next: null, diff: null };
  }
  const diff = compareLedger(cur, snapshot);
  if (acceptAdditions && diff.appendOnly) {
    return { kind: 'mismatch', next: applyReflection(cur, reflectedHeadings), diff };
  }
  return { kind: 'mismatch', next: null, diff };
}

/**
 * 人間向けの差分表示。
 * @param {{ added?: string[], removed?: string[], changed?: string[], missing?: string[], appendOnly?: boolean }} result
 * @returns {string}
 */
export function formatDiff(result) {
  const out = [];
  const section = (label, list) => {
    if (list && list.length > 0) {
      out.push(`${label}（${list.length} 件）:`);
      for (const h of list) out.push(`  ${h}`);
    }
  };
  section('スナップショットに無い見出し（追記）', result.added);
  section('スナップショットにあるが台帳から消えた見出し', result.removed);
  section('本文が変わった見出し', result.changed);
  section('reflection.json にあるがスナップショットに無い見出し', result.missing);
  if (out.length === 0) out.push('差分なし');
  return out.join('\n');
}

function parseArgs(argv) {
  const opts = { command: null, root: null, acceptAdditions: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') {
      const v = argv[++i];
      if (v === undefined) {
        opts.error = '--root に値がありません';
        break;
      }
      opts.root = v;
    } else if (a === '--accept-additions') {
      opts.acceptAdditions = true;
    } else if (opts.command === null && (a === 'check' || a === 'apply')) {
      opts.command = a;
    } else {
      opts.error = `不明な引数: ${a}`;
      break;
    }
  }
  if (!opts.error && opts.command === null) opts.error = 'サブコマンド check または apply が必要です';
  if (!opts.error && opts.acceptAdditions && opts.command !== 'apply') {
    opts.error = '--accept-additions は apply だけで使えます';
  }
  return opts;
}

/**
 * CLI 本体。終了コードを返す（process.exit は呼ばない）。
 * @param {string[]} argv
 * @param {{ reflectionPath?: string, snapshotPath?: string, stdout?: (s: string) => void, stderr?: (s: string) => void, cwd?: string }} [io]
 * @returns {number}
 */
export function runCli(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s + '\n'));
  const err = io.stderr ?? ((s) => process.stderr.write(s + '\n'));
  const opts = parseArgs(argv);
  if (opts.error) {
    err(`エラー: ${opts.error}`);
    err('使い方: lessons-ledger.mjs check|apply [--root <dir>] [--accept-additions]');
    return 2;
  }

  let reflection;
  let snapshot;
  try {
    reflection = JSON.parse(readFileSync(io.reflectionPath ?? DEFAULT_REFLECTION, 'utf8'));
    snapshot = readFileSync(io.snapshotPath ?? DEFAULT_SNAPSHOT, 'utf8');
  } catch (e) {
    err(`エラー: reflection.json / ledger-snapshot.txt を読めません: ${e.message}`);
    return 2;
  }
  if (!Array.isArray(reflection.entries)) {
    err('エラー: reflection.json の entries が配列ではありません');
    return 2;
  }
  const reflectedHeadings = reflection.entries.map((e) => e.heading);
  if (reflectedHeadings.some((h) => typeof h !== 'string')) {
    err('エラー: reflection.json の見出しが文字列ではありません');
    return 2;
  }

  // 反映済みの項目が0件なら、削除するものが無い。台帳の有無・中身は問わない（対象側で自由に追記される）。
  if (reflectedHeadings.length === 0) {
    out('反映済み 0 件・未反映 0 件（reflection.json の entries が空）');
    out(opts.command === 'apply' ? '何も削除しません（台帳は書き換えません）' : '配置してよい');
    return 0;
  }

  const root = path.resolve(opts.root ?? io.cwd ?? process.cwd());
  const ledgerPath = path.join(root, 'tasks', 'lessons.md');
  let current = null;
  if (existsSync(ledgerPath)) {
    try {
      current = readFileSync(ledgerPath, 'utf8');
    } catch (e) {
      err(`エラー: ${ledgerPath} を読めません: ${e.message}`);
      return 2;
    }
  }

  const plan = planAction({ current, snapshot, reflectedHeadings, acceptAdditions: opts.acceptAdditions });
  const audit = `監査: git diff --stat -- tasks/lessons.md で、差分が反映済み ${reflectedHeadings.length} 件の削除だけであることを確かめる`;

  if (plan.kind === 'invalid') {
    err('エラー: reflection.json の見出しがスナップショットに見つかりません');
    err(formatDiff(plan.diff));
    return 2;
  }

  if (opts.command === 'check') {
    if (plan.kind === 'unapplied') {
      out('一致（未適用）。配置してよい');
      out(audit);
      return 0;
    }
    if (plan.kind === 'applied') {
      out('適用済み');
      out(audit);
      return 0;
    }
    out('台帳がスナップショットと一致しません。配置を止めて差分を確認してください');
    out(formatDiff(plan.diff));
    out(audit);
    return 1;
  }

  // apply
  if (plan.kind === 'applied') {
    out('適用済み（何もしません）');
    out(audit);
    return 0;
  }
  if (plan.kind === 'mismatch' && plan.next === null) {
    out('台帳がスナップショットと一致しないため書き込みません');
    out(formatDiff(plan.diff));
    out(audit);
    return 1;
  }
  try {
    if (plan.next === '') {
      unlinkSync(ledgerPath);
    } else {
      writeFileSync(ledgerPath, plan.next, 'utf8');
    }
  } catch (e) {
    err(`エラー: ${ledgerPath} を更新できません: ${e.message}`);
    return 2;
  }
  out(`反映済み ${reflectedHeadings.length} 件を削除しました:`);
  for (const h of reflectedHeadings) out(`  ${h}`);
  if (plan.kind === 'mismatch') {
    out('追記分は残しました（--accept-additions）:');
    out(formatDiff(plan.diff));
  }
  if (plan.next === '') out('台帳が空になったため tasks/lessons.md を削除しました');
  out(audit);
  return 0;
}

function main() {
  process.exit(runCli(process.argv.slice(2)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}

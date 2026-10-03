#!/usr/bin/env node
// pr-body: .github/pull_request_template.md の見出しに沿って PR 本文を組み立て、一時ファイルに書いてパスを出力する。
// テンプレートの見出しをこのスクリプトに転記しない（実行時に読む）。見出しが変わっても欄を落とさない:
// 見出しの語から埋め方を決め、決められない欄はテンプレートの本文のまま残す。
//
// 使い方（リポジトリ root で実行）:
//   node .claude/skills/tsod-ship/scripts/pr-body.mjs NNN
//
// 出力: 本文ファイルのパス（${TMPDIR:-/tmp}/tsod-pr/NNN-body.md）。テンプレートのまま残した欄があれば、その見出しも出す。
// 終了コード: 0 成功／2 引数誤り・必要なファイルが無い。
// Node ESM・依存ゼロ。純関数（テンプレートの解析・節の抽出・本文の組み立て）を export する。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TEMPLATE_PATH = '.github/pull_request_template.md';

/**
 * テンプレートを解析する。純関数。
 * 先頭の HTML コメントなど、最初の `## ` より前の部分は捨てる。
 * @returns {{heading: string, body: string}[]}
 */
export function parseTemplate(text) {
  const lines = String(text).split(/\r?\n/);
  const sections = [];
  let current = null;
  let inComment = false;
  for (const line of lines) {
    if (!inComment && line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { heading: line.slice(3).trim(), bodyLines: [] };
      continue;
    }
    // 最初の見出しより前（HTML コメント等）は読み飛ばす。
    if (current) current.bodyLines.push(line);
    if (line.includes('<!--') && !line.includes('-->')) inComment = true;
    else if (line.includes('-->')) inComment = false;
  }
  if (current) sections.push(current);
  return sections.map((s) => ({ heading: s.heading, body: s.bodyLines.join('\n').trim() }));
}

/**
 * Markdown から `## <heading>` で始まる節の本文を取り出す。純関数。無ければ null。
 * heading は前方一致で探す。
 */
export function extractSection(text, heading) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n').trim();
}

/**
 * HTML コメントを取り除く。純関数。
 */
export function stripComments(text) {
  return String(text).replace(/<!--[\s\S]*?-->/g, '').trim();
}

/**
 * spec.md の「受入基準」節から、番号つきの基準を取り出す。純関数。
 * 「1. …」の形はその番号を使い、「- …」の形は出現順に番号を振る。
 * @returns {{no: number, text: string}[]}
 */
export function extractAcceptanceCriteria(specText) {
  const section = extractSection(specText, '受入基準');
  if (section === null) return [];
  const items = [];
  let seq = 0;
  for (const line of section.split('\n')) {
    const numbered = line.match(/^\s*(\d+)\.\s+(.*\S)\s*$/);
    const bullet = line.match(/^\s*-\s+(.*\S)\s*$/);
    if (numbered) {
      seq = Number(numbered[1]);
      items.push({ no: seq, text: numbered[2] });
    } else if (bullet) {
      seq += 1;
      items.push({ no: seq, text: bullet[1] });
    }
  }
  return items;
}

/**
 * plan.md の「常時許可外の変更」節の箇条書きを取り出す。純関数。「- なし」や節なしは空配列。
 */
export function extractOutsideChanges(planText) {
  const section = extractSection(planText ?? '', '常時許可外の変更');
  if (section === null) return [];
  return section
    .split('\n')
    .filter((l) => /^\s*-\s+/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, '').trim())
    .filter((l) => l !== '' && !l.startsWith('なし'));
}

function shorten(text, max = 80) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * 見出しの語から、その欄の埋め方を決めて本文を返す。決められない欄は null。純関数。
 * ctx: {specId, criteria, contractChanged, contractFiles, outsideChanges, handoffRequired}
 */
export function fillSection(heading, ctx) {
  if (/仕様\s*ID/i.test(heading)) {
    return ctx.specId;
  }
  if (/受入基準/.test(heading)) {
    if (!ctx.criteria || ctx.criteria.length === 0) return null;
    return ctx.criteria.map((c) => `- [ ] 受入基準 ${c.no}: ${shorten(c.text)}`).join('\n');
  }
  if (/契約/.test(heading)) {
    if (ctx.contractChanged === null || ctx.contractChanged === undefined) return null;
    if (!ctx.contractChanged) return 'なし';
    const files = (ctx.contractFiles ?? []).map((f) => `  - \`${f}\``).join('\n');
    return files ? `あり（\`contracts/**\` の差分）\n${files}` : 'あり（`contracts/**` の差分）';
  }
  if (/常時許可外/.test(heading)) {
    const list = ctx.outsideChanges ?? [];
    if (list.length === 0) return 'なし';
    return `あり\n${list.map((l) => `- ${l}`).join('\n')}`;
  }
  if (/handoff|必須の記載事項/.test(heading)) {
    const text = stripComments(ctx.handoffRequired ?? '');
    return text === '' ? 'なし' : text;
  }
  return null;
}

/**
 * テンプレートと文脈から本文を組み立てる。純関数。
 * 見出しはテンプレートのものをそのまま使い、1つも落とさない。決められない欄はテンプレートの本文を残し、kept に見出しを集める。
 * @returns {{body: string, kept: string[]}}
 */
export function buildBody(templateSections, ctx) {
  const kept = [];
  const parts = templateSections.map((sec) => {
    const filled = fillSection(sec.heading, ctx);
    if (filled === null) {
      kept.push(sec.heading);
      return `## ${sec.heading}\n\n${stripComments(sec.body)}`.trimEnd();
    }
    return `## ${sec.heading}\n\n${filled}`;
  });
  return { body: `${parts.join('\n\n')}\n`, kept };
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' });
}

function findSpecDir(nnn) {
  if (!existsSync('specs')) return null;
  const hit = readdirSync('specs').find((n) => n.startsWith(`${nnn}-`));
  return hit ? path.posix.join('specs', hit) : null;
}

function mergeBase() {
  for (const ref of ['origin/main', 'main']) {
    const r = run('git', ['merge-base', 'HEAD', ref]);
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function main() {
  const nnn = process.argv[2];
  if (!nnn || !/^\d+$/.test(nnn.split('-')[0])) {
    console.error('使い方: node pr-body.mjs NNN');
    process.exit(2);
  }
  const id = nnn.split('-')[0];
  const specDir = findSpecDir(id);
  if (!specDir) {
    console.error(`specs/${id}-* が見つかりません`);
    process.exit(2);
  }
  const template = readIfExists(TEMPLATE_PATH);
  if (template === null) {
    console.error(`${TEMPLATE_PATH} が見つかりません`);
    process.exit(2);
  }

  const spec = readIfExists(`${specDir}/spec.md`) ?? '';
  const plan = readIfExists(`${specDir}/plan.md`);
  const handoff = readIfExists(`${specDir}/handoff.md`);

  let contractChanged = null;
  let contractFiles = [];
  const base = mergeBase();
  if (base) {
    const quiet = run('git', ['diff', '--quiet', `${base}..HEAD`, '--', 'contracts/']);
    if (quiet.status === 0) contractChanged = false;
    else if (quiet.status === 1) {
      contractChanged = true;
      const names = run('git', ['diff', '--name-only', `${base}..HEAD`, '--', 'contracts/']);
      contractFiles = names.stdout.split('\n').filter(Boolean);
    }
  }

  const ctx = {
    specId: specDir,
    criteria: extractAcceptanceCriteria(spec),
    contractChanged,
    contractFiles,
    outsideChanges: extractOutsideChanges(plan),
    handoffRequired: handoff ? extractSection(handoff, 'PR 本文に必須の記載事項') : null,
  };
  const { body, kept } = buildBody(parseTemplate(template), ctx);

  const outDir = path.join(process.env.TMPDIR || os.tmpdir(), 'tsod-pr');
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${id}-body.md`);
  writeFileSync(out, body);

  console.log(`本文ファイル: ${out}`);
  if (kept.length > 0) {
    console.log(`テンプレートのまま残した欄（確かめて埋める）: ${kept.join(' / ')}`);
  }
  process.exit(0);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}

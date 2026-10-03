#!/usr/bin/env node
// drift-scan: 区間 E のドリフト検査のうち、機械で検出できる項目をチェックリストとしてファイルに書き、件数の要約だけを出力する。
// 読み取りだけを行う（リポジトリのファイルは書かない。出力ファイルは一時ディレクトリ）。
//
// 使い方（リポジトリ root で実行）:
//   node .claude/skills/tsod-ship/scripts/drift-scan.mjs NNN [--out <パス>]
//
// 検出する項目:
//   1. spec の受入基準の番号が、tasks.md とテスト（テスト名・コメント）に現れるか
//   2. spec の契約差分のエンドポイントが contracts/openapi.yaml から辿れ、x-swv-status: draft が残っていないか
//   3. 当該機能の decisions.md の Q 番号が open-questions.md に残っていないか（open-questions.md が無ければ「無し」）
//   4. CLAUDE.md「Commands」の表と verify.mjs の実行計画（buildPlan）の一致、および ci.yml の run: 行との対応
//   5. .claude/README.md の Subagent 一覧と .claude/agents/ の実在の一致
//   6. temp/ に、当該機能 ID の「未卒業」の予約が残っていないか
// 突き合わせの3者（4 の対象）は、CLAUDE.md の `## Commands` 節・.github/workflows/ci.yml の run 行・verify.mjs の計画。README は読まない。
// temp/ の卒業記録の有無は、卒業記録の書き方（完了追記または節の削除）が文面の判断を要するため、機械では 6 の予約の残存だけを見る。
//
// 出力ファイル: 既定 ${TMPDIR:-/tmp}/tsod-drift/NNN.md
// 終了コード: 0 検査を実行できた（指摘の有無は要約の件数で見る）／2 引数誤り・必要なファイルが無い。
// Node ESM・依存ゼロ。純関数を export する。

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildPlan, detectE2eConfigured, parseArgs as parseVerifyArgs } from '../../tsod-verify/scripts/verify.mjs';

// 突き合わせに使う verify.mjs の実行計画の引数。CLAUDE.md の表・ci.yml に e2e の行が加わったときに指摘を出せるよう、計画も `--e2e` 付きで組む。
// verify.mjs の計画は、apps/web に test:e2e と e2e/ が無い間は e2e の段をコマンド無しの SKIP にする。
// そのため `pnpm:test:e2e` は計画に入らず、e2e が未設定の今は偽の指摘（表・ci.yml に無いのに計画にある）を出さない。
// 設定されると、計画に `pnpm:test:e2e` が自動で入る（そのとき CLAUDE.md の Commands 表と ci.yml にも e2e が必要になる）。
export const DRIFT_PLAN_ARGS = ['--e2e'];

// CLAUDE.md「Commands」の「意図的な差」に対応する、表にだけ現れてよいコマンド。
// 判定に使う正はこの集合。CLAUDE.md の「意図的な差」の列挙は、理由を説明する文章で、スクリプトは読まない（両者は一字一句対応させる）。
export const TABLE_ONLY_INTENTIONAL = new Set([
  'gradle:test', // build に含まれる
  'gradle:classes', // typecheck は build に含まれるため個別の段にしない（ci.yml も同じ）
  'gradle:testClasses',
  'gradle:jacocoTestReport', // coverage は Sonar の全体解析が実行する
  'pnpm:test:coverage', // 通常の一括検証に含めない（Sonar の全体解析で実行する）
  'pnpm:lint', // 自動修正はローカルの任意操作で、検証の段ではない
  'pnpm:format', // 同上
]);

// 受入基準の番号を探すテストの置き場（存在しないディレクトリは飛ばす）と拡張子。
export const TEST_DIRS = [
  'apps/api/src/test',
  'apps/web/src/test',
  'packages/solver/src/test',
  'packages/data/src/test',
  'apps/web/e2e',
];
export const TEST_EXTS = ['.java', '.kt', '.ts', '.vue'];

// ---------------------------------------------------------------- 共通

/**
 * Markdown から `## <heading>` で始まる節の本文を取り出す。純関数。無ければ null。
 */
export function sectionOf(text, heading) {
  const lines = String(text ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## ${heading}`));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

// ---------------------------------------------------------------- 1. 受入基準の番号

/**
 * 「1, 2, 3」「1〜3」「2・4」のような数字の並びから番号の集合を作る。純関数。
 */
export function parseCriteriaNumbers(text) {
  const nums = new Set();
  for (const m of String(text).matchAll(/(\d+)\s*[〜~\-–]\s*(\d+)|(\d+)/g)) {
    if (m[3] !== undefined) {
      nums.add(Number(m[3]));
    } else {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (b >= a && b - a <= 50) {
        for (let i = a; i <= b; i++) nums.add(i);
      }
    }
  }
  return nums;
}

/**
 * テキストの中で「受入基準 N」の形（または AC-N）で言及されている番号の集合を返す。純関数。
 */
export function mentionedCriteria(text) {
  const nums = new Set();
  for (const m of String(text ?? '').matchAll(/受入基準[ \t]*([0-9][0-9,、・ \t〜~\-–]*)/g)) {
    for (const n of parseCriteriaNumbers(m[1])) nums.add(n);
  }
  for (const m of String(text ?? '').matchAll(/\bAC[-_ ]?(\d+)\b/g)) {
    nums.add(Number(m[1]));
  }
  return nums;
}

/**
 * spec.md の「受入基準」節の番号を取り出す。純関数。「1. …」はその番号、「- …」は出現順に振る。
 */
export function criteriaNumbers(specText) {
  const section = sectionOf(specText, '受入基準');
  if (section === null) return [];
  const nums = [];
  let seq = 0;
  for (const line of section.split('\n')) {
    const numbered = line.match(/^\s*(\d+)\.\s+\S/);
    if (numbered) {
      seq = Number(numbered[1]);
      nums.push(seq);
    } else if (/^\s*-\s+\S/.test(line)) {
      seq += 1;
      nums.push(seq);
    }
  }
  return nums;
}

/**
 * 受入基準の番号が tasks.md とテストに現れるかを調べる。純関数。
 * testFiles: {file, text}[]
 */
export function checkAcceptanceCoverage(numbers, tasksText, testFiles) {
  const inTasksSet = mentionedCriteria(tasksText);
  const testHits = new Map();
  for (const f of testFiles) {
    for (const n of mentionedCriteria(f.text)) {
      if (!testHits.has(n)) testHits.set(n, []);
      testHits.get(n).push(f.file);
    }
  }
  return numbers.map((no) => ({
    no,
    inTasks: inTasksSet.has(no),
    inTests: testHits.has(no),
    files: testHits.get(no) ?? [],
  }));
}

// ---------------------------------------------------------------- 2. 契約差分のエンドポイント

/**
 * spec.md の「契約差分」節から `METHOD /path` のエンドポイントを取り出す。純関数。
 */
export function extractEndpoints(specText) {
  const section = sectionOf(specText, '契約差分');
  if (section === null) return [];
  const seen = new Set();
  const result = [];
  for (const m of section.matchAll(/`(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\/[^`\s]*)`/g)) {
    const key = `${m[1]} ${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ method: m[1], path: m[2] });
    }
  }
  return result;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * エンドポイントが openapi.yaml から辿れるか、draft が残っていないかを調べる。純関数。
 * readRef(relPath): openapi.yaml からの相対参照の中身を返す（読めなければ null）。
 */
export function checkEndpoints(endpoints, openapiText, readRef) {
  const lines = String(openapiText ?? '').split(/\r?\n/);
  return endpoints.map(({ method, path: p }) => {
    const label = `${method} ${p}`;
    const problems = [];
    const idx = lines.findIndex((l) => new RegExp(`^ {2}${escapeRe(p)}:\\s*$`).test(l));
    if (idx === -1) {
      return { endpoint: label, ok: false, problems: ['openapi.yaml の paths に無い'] };
    }
    let body = '';
    const next = lines[idx + 1] ?? '';
    const ref = next.match(/\$ref:\s*['"]?([^'"\s]+)/);
    if (ref) {
      const text = readRef(ref[1]);
      if (text === null || text === undefined) {
        return { endpoint: label, ok: false, problems: [`参照先を読めない: ${ref[1]}`] };
      }
      body = text;
    } else {
      const block = [];
      for (let i = idx + 1; i < lines.length; i++) {
        if (/^ {0,2}\S/.test(lines[i])) break;
        block.push(lines[i]);
      }
      body = block.join('\n');
    }
    const methodRe = new RegExp(`^\\s*${method.toLowerCase()}:\\s*$`, 'm');
    if (!methodRe.test(body)) problems.push(`${method.toLowerCase()} の定義が無い`);
    if (/x-swv-status:\s*draft/.test(body)) problems.push('`x-swv-status: draft` が残っている');
    return { endpoint: label, ok: problems.length === 0, problems };
  });
}

// ---------------------------------------------------------------- 3. decisions.md と open-questions.md

const Q_DEF = /^\s*-\s*(?:\[[ xX]\]\s*)?Q(\d+)\s*[:：]/gm;

export function questionNumbers(text) {
  const nums = new Set();
  for (const m of String(text ?? '').matchAll(Q_DEF)) nums.add(Number(m[1]));
  return nums;
}

/**
 * decisions.md に移った Q 番号が、open-questions.md に残っていないかを調べる。純関数。
 * open-questions.md が無い（null）ときは、残っている項目は無しとして扱う（異常にしない）。
 * @returns {{moved: number[], leftover: number[]}}
 */
export function checkDecisionsMigrated(decisionsText, openQuestionsText) {
  const moved = [...questionNumbers(decisionsText)].sort((a, b) => a - b);
  const open = questionNumbers(openQuestionsText);
  return { moved, leftover: moved.filter((n) => open.has(n)) };
}

// ---------------------------------------------------------------- 4. Commands 表・verify.mjs・ci.yml

/**
 * コマンド1行から、突き合わせ用のトークンを作る。純関数。
 * - pnpm: `pnpm --filter <selector> run <script>`・`pnpm -r run <script>`・`pnpm run <script>`・`pnpm <script>` を、
 *   同じ `pnpm:<script>` に正規化する。`install`・`exec`・`add`・`dlx` はトークンにしない。
 * - ./gradlew: 各タスク名を `gradle:<task>` にし、`--` や `-` で始まるオプションは捨てる。
 * - `<...>` を含むプレースホルダ（`<script>` など）はトークンにしない。
 * `&&`・`;`・`|` で区切られた各コマンドを個別に見る。
 */
export function tokensFromCommandLine(cmd) {
  const tokens = [];
  for (const segment of String(cmd).split(/&&|\|\||;|\|/)) {
    const words = segment.replace(/[()]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (words[0] === 'pnpm') {
      let i = 1;
      while (i < words.length && words[i].startsWith('-')) {
        i += ['--filter', '-F', '--filter-prod', '-C', '--dir', '--reporter', '--workspace-concurrency'].includes(words[i]) ? 2 : 1;
      }
      if (i >= words.length) continue;
      let sub = words[i];
      if (sub === 'run' || sub === 'run-script') {
        let j = i + 1;
        while (j < words.length && words[j].startsWith('-')) j += 1;
        sub = words[j];
      } else if (['exec', 'install', 'i', 'add', 'dlx'].includes(sub)) {
        continue;
      }
      if (!sub || /[<>]/.test(sub)) continue;
      tokens.push(`pnpm:${sub}`);
    } else if (words[0] === './gradlew') {
      for (const w of words.slice(1)) {
        if (w.startsWith('-') || /[<>]/.test(w)) continue;
        tokens.push(`gradle:${w}`);
      }
    }
  }
  return tokens;
}

/**
 * verify.mjs の実行計画から、コマンドのトークン集合を作る。純関数。
 * コマンドを持たない段（SKIP の段）はトークンを生まない。
 */
export function tokensFromPlan(plan) {
  const tokens = new Set();
  for (const step of plan) {
    if (step.command === 'pnpm' && step.args?.length) {
      for (const t of tokensFromCommandLine(`pnpm ${step.args.join(' ')}`)) tokens.add(t);
    } else if (step.command === './gradlew') {
      for (const t of tokensFromCommandLine(`./gradlew ${(step.args ?? []).join(' ')}`)) tokens.add(t);
    }
    if (step.special === 'schemaFreshness') tokens.add('pnpm:contract:types');
  }
  return tokens;
}

/**
 * CLAUDE.md の「Commands」節のバッククォートで囲まれたコマンドから、トークン集合を作る。純関数。
 * README は読まない。
 */
export function tokensFromCommandsTable(claudeMdText) {
  const section = sectionOf(claudeMdText, 'Commands');
  const tokens = new Set();
  if (section === null) return tokens;
  for (const m of section.matchAll(/`([^`]+)`/g)) {
    for (const t of tokensFromCommandLine(m[1])) tokens.add(t);
  }
  return tokens;
}

/**
 * ci.yml の `run:` 行（1行・ブロックとも）から、トークン集合を作る。純関数。
 */
export function extractCiTokens(ciText) {
  const tokens = new Set();
  const lines = String(ciText ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    const rest = m[2].trim();
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === '') continue;
        const ind = l.match(/^(\s*)/)[1].length;
        if (ind <= indent) break;
        for (const t of tokensFromCommandLine(l)) tokens.add(t);
      }
    } else if (rest !== '') {
      for (const t of tokensFromCommandLine(rest)) tokens.add(t);
    }
  }
  return tokens;
}

/**
 * Commands 表・一括検証の実行計画・ci.yml の対応を調べる。純関数。
 * @returns {{kind: string, token: string, message: string}[]}
 */
export function checkCommandsConsistency({ plan, claudeMdText, ciText }) {
  const planTokens = tokensFromPlan(plan);
  const tableTokens = tokensFromCommandsTable(claudeMdText);
  const ciTokens = extractCiTokens(ciText);
  const findings = [];
  for (const t of planTokens) {
    if (!tableTokens.has(t)) {
      findings.push({ kind: 'plan-not-in-table', token: t, message: `verify.mjs にあるが、CLAUDE.md「Commands」に無い: ${t}` });
    }
    if (!ciTokens.has(t)) {
      findings.push({ kind: 'plan-not-in-ci', token: t, message: `verify.mjs にあるが、ci.yml の run: に無い: ${t}` });
    }
  }
  for (const t of tableTokens) {
    if (!planTokens.has(t) && !TABLE_ONLY_INTENTIONAL.has(t)) {
      findings.push({ kind: 'table-not-in-plan', token: t, message: `CLAUDE.md「Commands」にあるが、verify.mjs に無い（意図的な差の列挙にも無い）: ${t}` });
    }
  }
  for (const t of ciTokens) {
    if (!planTokens.has(t)) {
      findings.push({ kind: 'ci-not-in-plan', token: t, message: `ci.yml の run: にあるが、verify.mjs に無い: ${t}` });
    }
  }
  return findings;
}

// ---------------------------------------------------------------- 5. Subagent 一覧

/**
 * .claude/README.md の Subagent 一覧と、.claude/agents/ の実在を比べる。純関数。
 */
export function checkAgentList(readmeText, agentNames) {
  if (readmeText === null || readmeText === undefined) {
    return { missingInReadme: [], extraInReadme: [], readmeMissing: true };
  }
  const listed = new Set();
  for (const m of String(readmeText).matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)*-(?:agent|investigator))`/g)) {
    listed.add(m[1]);
  }
  const actual = new Set(agentNames);
  return {
    missingInReadme: [...actual].filter((n) => !listed.has(n)).sort(),
    extraInReadme: [...listed].filter((n) => !actual.has(n)).sort(),
    readmeMissing: false,
  };
}

// ---------------------------------------------------------------- 6. temp/ の未卒業の予約

/**
 * temp/ の中に、当該機能 ID の「未卒業」の予約が残っていないかを調べる。純関数。
 * files: {file, text}[]
 */
export function findUnclaimedReservations(files, nnn) {
  const re = new RegExp(`未卒業[^\\n]*機能\\s*${escapeRe(nnn)}(?!\\d)`);
  const hits = [];
  for (const f of files) {
    String(f.text ?? '')
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (re.test(line)) hits.push({ file: f.file, line: i + 1, text: line.trim() });
      });
  }
  return hits;
}

// ---------------------------------------------------------------- 出力

function box(ok) {
  return ok ? '[x]' : '[ ]';
}

/**
 * 検査結果から、チェックリスト（Markdown）と件数を組み立てる。純関数。
 * sections: {title, items: {ok, text}[], note?}[]
 */
export function formatChecklist(nnn, sections) {
  const lines = [`# ドリフト検査（機械検出分）: 機能${nnn}`, ''];
  let findings = 0;
  let checked = 0;
  for (const s of sections) {
    lines.push(`## ${s.title}`);
    if (s.note) lines.push(s.note);
    for (const it of s.items) {
      lines.push(`- ${box(it.ok)} ${it.text}`);
      checked += 1;
      if (!it.ok) findings += 1;
    }
    lines.push('');
  }
  lines.push(`機械検出の指摘: ${findings} 件（確認した項目 ${checked} 件）`);
  return { markdown: `${lines.join('\n')}\n`, findings, checked };
}

/**
 * 各検査の結果を、チェックリストの節に変換する。純関数。
 */
export function buildSections(results) {
  const sections = [];
  if (results.coverage) {
    sections.push({
      title: '1. 受入基準の番号（tasks.md・テスト）',
      note: '番号が現れないものは、テストが無いのか、番号の書き忘れなのかを判断する。',
      items: results.coverage.length
        ? results.coverage.map((c) => ({
            ok: c.inTasks && c.inTests,
            text: `受入基準 ${c.no}: tasks.md ${c.inTasks ? 'あり' : '無し'} / テスト ${c.inTests ? `あり（${c.files.slice(0, 3).join(', ')}）` : '無し'}`,
          }))
        : [{ ok: false, text: 'spec.md の受入基準を取り出せなかった' }],
    });
  }
  if (results.endpoints) {
    sections.push({
      title: '2. 契約差分のエンドポイント（openapi.yaml）',
      items: results.endpoints.length
        ? results.endpoints.map((e) => ({ ok: e.ok, text: e.ok ? e.endpoint : `${e.endpoint}: ${e.problems.join('／')}` }))
        : [{ ok: true, text: '契約差分にエンドポイントの記載なし' }],
    });
  }
  if (results.decisions) {
    const d = results.decisions;
    sections.push({
      title: '3. decisions.md と open-questions.md',
      items: [
        {
          ok: true,
          text: d.noDecisions
            ? 'decisions.md なし（この機能で解消した未確定事項が無ければ問題ない）'
            : d.moved.length
              ? `decisions.md の Q 番号: ${d.moved.map((n) => `Q${n}`).join(', ')}`
              : 'decisions.md に Q 番号なし',
        },
        {
          ok: d.leftover.length === 0,
          text: d.leftover.length
            ? `open-questions.md に残っている: ${d.leftover.map((n) => `Q${n}`).join(', ')}`
            : d.openQuestionsMissing
              ? 'open-questions.md なし（未解消の項目は無し）'
              : 'open-questions.md に、移設済みの Q 番号は残っていない',
        },
      ],
    });
  }
  if (results.commands) {
    sections.push({
      title: '4. Commands 表・verify.mjs・ci.yml',
      note: '「意図的な差」の判定の正は drift-scan.mjs の集合（`TABLE_ONLY_INTENTIONAL`）。CLAUDE.md「Commands」の列挙は理由の説明。差の妥当性は判断する。',
      items: results.commands.length
        ? results.commands.map((f) => ({ ok: false, text: f.message }))
        : [{ ok: true, text: 'Commands 表・verify.mjs・ci.yml のコマンドが対応している' }],
    });
  }
  if (results.agents) {
    const a = results.agents;
    sections.push({
      title: '5. .claude/README.md の Subagent 一覧',
      items: a.readmeMissing
        ? [{ ok: false, text: '.claude/README.md を読めなかった' }]
        : [
            { ok: a.missingInReadme.length === 0, text: a.missingInReadme.length ? `README に無い Subagent: ${a.missingInReadme.join(', ')}` : '.claude/agents/ の Subagent はすべて README に載っている' },
            { ok: a.extraInReadme.length === 0, text: a.extraInReadme.length ? `README にあるが実在しない: ${a.extraInReadme.join(', ')}` : 'README の Subagent はすべて実在する' },
          ],
    });
  }
  if (results.temp) {
    sections.push({
      title: '6. temp/ の未卒業の予約',
      note: '卒業記録の有無そのもの（実装した節に完了追記があるか）は、temp-graduation.md に照らして判断する。',
      items: results.temp.length
        ? results.temp.map((h) => ({ ok: false, text: `${h.file}:${h.line} ${h.text}` }))
        : [{ ok: true, text: '当該機能 ID の未卒業の予約は残っていない' }],
    });
  }
  return sections;
}

// ---------------------------------------------------------------- 実行

function readIfExists(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function walkFiles(dir, exts) {
  const out = [];
  const walk = (cur) => {
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist') continue;
      const full = path.join(cur, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (exts.some((e) => name.endsWith(e))) out.push(full.split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

function loadFiles(dirs, exts) {
  return dirs
    .flatMap((d) => walkFiles(d, exts))
    .map((file) => ({ file, text: readIfExists(file) ?? '' }));
}

function parseCliArgs(argv) {
  let nnn = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      out = argv[i + 1];
      i++;
      if (!out) throw new Error('--out の値がありません');
    } else if (argv[i].startsWith('--')) {
      throw new Error(`不明な引数です: ${argv[i]}`);
    } else if (nnn === null) {
      nnn = argv[i];
    } else {
      throw new Error('機能番号は1つだけ指定してください');
    }
  }
  if (nnn === null || !/^\d+/.test(nnn)) throw new Error('機能番号 NNN を指定してください');
  return { nnn: nnn.split('-')[0], out };
}

function main() {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error('使い方: node drift-scan.mjs NNN [--out <パス>]');
    process.exit(2);
  }
  const { nnn } = args;

  const specDirName = existsSync('specs') ? readdirSync('specs').find((n) => n.startsWith(`${nnn}-`)) : null;
  if (!specDirName) {
    console.error(`specs/${nnn}-* が見つかりません`);
    process.exit(2);
  }
  const specDir = `specs/${specDirName}`;
  const spec = readIfExists(`${specDir}/spec.md`);
  if (spec === null) {
    console.error(`${specDir}/spec.md が見つかりません`);
    process.exit(2);
  }

  const tasks = readIfExists(`${specDir}/tasks.md`) ?? '';
  const testFiles = loadFiles(TEST_DIRS, TEST_EXTS);
  const readRef = (rel) => readIfExists(path.join('contracts', rel));
  const decisions = readIfExists(`${specDir}/decisions.md`);
  const openQuestions = readIfExists('specs/open-questions.md');
  const agentNames = existsSync('.claude/agents')
    ? readdirSync('.claude/agents').filter((n) => existsSync(`.claude/agents/${n}/${n}.md`))
    : [];
  const tempFiles = loadFiles(['temp'], ['.md', '.txt', '.csv']);
  const plan = buildPlan(parseVerifyArgs(DRIFT_PLAN_ARGS), { e2eConfigured: detectE2eConfigured() });

  const results = {
    coverage: checkAcceptanceCoverage(criteriaNumbers(spec), tasks, testFiles),
    endpoints: checkEndpoints(extractEndpoints(spec), readIfExists('contracts/openapi.yaml'), readRef),
    decisions: {
      ...checkDecisionsMigrated(decisions, openQuestions),
      noDecisions: decisions === null,
      openQuestionsMissing: openQuestions === null,
    },
    commands: checkCommandsConsistency({
      plan,
      claudeMdText: readIfExists('CLAUDE.md') ?? '',
      ciText: readIfExists('.github/workflows/ci.yml') ?? '',
    }),
    agents: checkAgentList(readIfExists('.claude/README.md'), agentNames),
    temp: findUnclaimedReservations(tempFiles, nnn),
  };

  const { markdown, findings, checked } = formatChecklist(nnn, buildSections(results));
  const outPath = args.out ?? path.join(process.env.TMPDIR || os.tmpdir(), 'tsod-drift', `${nnn}.md`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown);

  console.log(`機械検出の指摘: ${findings} 件（確認した項目 ${checked} 件）`);
  console.log(`チェックリスト: ${outPath}`);
  process.exit(0);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}

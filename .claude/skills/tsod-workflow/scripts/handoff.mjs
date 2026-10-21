#!/usr/bin/env node
// handoff: specs/NNN-<slug>/handoff.md を決まった書式で更新・照合する。
// handoff は このスクリプトだけで更新する（Edit・sed・python・node -e で書き換えない）。
//
// 使い方（リポジトリのどこかで実行。NNN は機能の番号。`004` でも `004-solver-ui` でもよい）:
//   node .claude/skills/tsod-workflow/scripts/handoff.mjs gate NNN <ゲート> <記録>
//       ゲート記録の行を「承認済み」と「<今日> / <記録>」にする。記録の先頭がコミットのハッシュなら git に実在しないと exit 1。
//   node .claude/skills/tsod-workflow/scripts/handoff.mjs gate NNN <ゲート> --na "<理由>" [<記録>]
//       ゲート記録の行を「該当なし（<理由>）」にする。
//   node .claude/skills/tsod-workflow/scripts/handoff.mjs check NNN <ゲート>...
//       各ゲートが承認済みか該当なしで、記録のハッシュが履歴にあり、そのハッシュから HEAD と作業ツリーまでに
//       ゲートの成果物が変わっていないことを確かめる。不一致は理由を出して exit 1。
//   node .claude/skills/tsod-workflow/scripts/handoff.mjs set NNN <節> <キー> <値>
//       節の中の `- キー: 値` の行を書き換える。
//   node .claude/skills/tsod-workflow/scripts/handoff.mjs transition NNN <移行>
//       現在地の4行を、現在地の節のコメントにある「区間の終わりの定型」の行で書く（移行は `A→B`・`D→E` など）。
//   node .claude/skills/tsod-workflow/scripts/handoff.mjs row NNN <節> <セル>...
//       節の表に1行追記する。列数が表と違うと exit 2。
//   node .claude/skills/tsod-workflow/scripts/handoff.mjs note NNN <節> <文>
//       節に箇条を1行追記する。
//
// ゲートの成果物（check が変更を見るもの）:
//   A-1 decisions.md／A-2 spec.md／B-1 screen-design.md／B-2 design/data-model-standard.md・design/attributes.yaml・db/migration/**／
//   C-1 plan.md・tasks.md（tasks.md はチェックボックスの差を無視する。区間 D の再開で落ちないため）／D-1 handoff.md 以外の全体。
//   E-1・E-2 は成果物を持たず、状態だけを見る。
//
// 終了コード: 0 成功／1 不一致（check の不一致・gate のハッシュが実在しない）／2 引数誤り・対象が見つからない。
// Node ESM・依存ゼロ。純関数を export する。

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const USAGE = [
  '使い方:',
  '  node handoff.mjs gate NNN <ゲート> <記録>',
  '  node handoff.mjs gate NNN <ゲート> --na "<理由>" [<記録>]',
  '  node handoff.mjs check NNN <ゲート>...',
  '  node handoff.mjs set NNN <節> <キー> <値>',
  '  node handoff.mjs transition NNN <移行>',
  '  node handoff.mjs row NNN <節> <セル>...',
  '  node handoff.mjs note NNN <節> <文>',
].join('\n');

export const GATES = ['A-1', 'A-2', 'B-1', 'B-2', 'C-1', 'D-1', 'E-1', 'E-2'];
const GATE_SECTION = 'ゲート記録';
const CURRENT_SECTION = '現在地';

/** 終了コードを持つエラー。既定の 2 は引数誤り・対象が見つからないこと。 */
export class HandoffError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

/**
 * 引数を解析する。純関数。不正な引数は HandoffError(2) を投げる。
 */
export function parseArgs(argv) {
  const pos = [];
  let na = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--na') {
      if (i + 1 >= argv.length || String(argv[i + 1]).trim() === '') throw new HandoffError('--na には理由が要ります');
      na = argv[++i];
      continue;
    }
    if (a.startsWith('--')) throw new HandoffError(`不明な引数です: ${a}`);
    pos.push(a);
  }
  const [cmd, nnn, ...rest] = pos;
  if (!cmd) throw new HandoffError('サブコマンドがありません');
  if (!['gate', 'check', 'set', 'transition', 'row', 'note'].includes(cmd)) throw new HandoffError(`不明なサブコマンドです: ${cmd}`);
  if (!nnn || !/^\d{3,}(-.+)?$/.test(nnn)) throw new HandoffError('機能の番号 NNN（例: 004 または 004-solver-ui）がありません');
  if (na !== null && cmd !== 'gate') throw new HandoffError('--na は gate だけで使えます');

  const needGate = (g) => {
    if (!GATES.includes(g)) throw new HandoffError(`ゲートは ${GATES.join('・')} のどれかです: ${g}`);
  };
  switch (cmd) {
    case 'gate': {
      if (rest.length < 1 || rest.length > 2) throw new HandoffError('gate の引数は <ゲート> <記録> です');
      needGate(rest[0]);
      const record = rest[1] ?? null;
      if (na === null && record === null) throw new HandoffError('記録がありません（該当なしなら --na "<理由>"）');
      return { cmd, nnn, gate: rest[0], record, na };
    }
    case 'check': {
      if (rest.length < 1) throw new HandoffError('check にはゲートが1つ以上要ります');
      rest.forEach(needGate);
      return { cmd, nnn, gates: rest };
    }
    case 'set': {
      if (rest.length !== 3) throw new HandoffError('set の引数は <節> <キー> <値> です');
      return { cmd, nnn, section: rest[0], key: rest[1], value: rest[2] };
    }
    case 'transition': {
      if (rest.length !== 1) throw new HandoffError('transition の引数は <移行> です');
      return { cmd, nnn, transition: rest[0] };
    }
    case 'row': {
      if (rest.length < 2) throw new HandoffError('row の引数は <節> <セル>... です');
      return { cmd, nnn, section: rest[0], cells: rest.slice(1) };
    }
    default: {
      if (rest.length !== 2) throw new HandoffError('note の引数は <節> <文> です');
      return { cmd, nnn, section: rest[0], text: rest[1] };
    }
  }
}

/** 今日の日付を YYYY-MM-DD で返す（ローカル時刻）。 */
export function formatDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 番号から機能のディレクトリ名を選ぶ。純関数。ちょうど1つに決まらなければ HandoffError(2)。
 */
export function matchSpecDir(names, nnn) {
  const matches = names.filter((n) => n === nnn || n.startsWith(`${nnn}-`));
  if (matches.length === 0) throw new HandoffError(`specs/ に ${nnn} の機能が無い`);
  if (matches.length > 1) throw new HandoffError(`specs/ に ${nnn} に当たる機能が複数ある: ${matches.join('・')}`);
  return matches[0];
}

// ---- 文書の構造（行・節・コメント）----

/** 改行を保ったまま行に分ける。純関数。 */
export function splitLines(text) {
  return { lines: text.split(/\r?\n/), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

/**
 * HTML コメントに含まれる行を true にした配列を返す。純関数。
 * コメントの中の見出し・表は、書き換えの対象にしない。
 */
export function commentMask(lines) {
  let inComment = false;
  return lines.map((line) => {
    const started = inComment;
    const open = line.lastIndexOf('<!--');
    const close = line.lastIndexOf('-->');
    if (open > close) inComment = true;
    else if (close > open) inComment = false;
    return started || open >= 0;
  });
}

/**
 * `## <title>` の節の範囲を返す。純関数。無ければ HandoffError(2)。
 * @returns {{start: number, end: number}} start は見出し行、end は次の見出し行（または末尾）の位置。
 */
export function findSection(lines, mask, title) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!mask[i] && lines[i].trimEnd() === `## ${title}`) {
      start = i;
      break;
    }
  }
  if (start < 0) throw new HandoffError(`節「${title}」が handoff.md に無い`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (!mask[i] && /^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** 表の1行をセルに分ける。純関数。`\|` はセルの区切りにしない。 */
export function splitCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim());
}

/** セルを表の1行にする。純関数。空のセルは `| |` の形。 */
export function joinCells(cells) {
  return `|${cells.map((c) => (c === '' ? ' ' : ` ${c} `)).join('|')}|`;
}

/** セルの文字列を表に入れられる形にする（改行を空白に、`|` をエスケープ）。純関数。 */
export function escapeCell(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/(?<!\\)\|/g, '\\|');
}

const oneLine = (value) => String(value).replace(/\r?\n/g, ' ');

// ---- 書き換え（文字列 → 文字列。純関数）----

/** 節の `- キー: 値` の行を書き換える。 */
export function setKey(text, section, key, value) {
  const { lines, eol } = splitLines(text);
  const mask = commentMask(lines);
  const sec = findSection(lines, mask, section);
  const prefix = `- ${key}:`;
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (!mask[i] && lines[i].startsWith(prefix)) {
      lines[i] = `${prefix} ${oneLine(value)}`;
      return lines.join(eol);
    }
  }
  throw new HandoffError(`節「${section}」に「- ${key}: 」の行が無い`);
}

/** ゲート記録の行を探す。 */
function findGateRow(lines, mask, gate) {
  const sec = findSection(lines, mask, GATE_SECTION);
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (mask[i] || !lines[i].trim().startsWith('|')) continue;
    const cells = splitCells(lines[i]);
    if (cells[0] === gate) {
      if (cells.length !== 4) throw new HandoffError(`ゲート記録の ${gate} の行が4列でない`);
      return { index: i, cells };
    }
  }
  throw new HandoffError(`ゲート記録に ${gate} の行が無い`);
}

/** ゲート記録の1行を読む。 */
export function readGateRow(text, gate) {
  const { lines } = splitLines(text);
  const { cells } = findGateRow(lines, commentMask(lines), gate);
  return { gate, target: cells[1], status: cells[2], record: cells[3] };
}

/** ゲート記録の行の状態と記録を書く。 */
export function setGate(text, gate, status, record) {
  const { lines, eol } = splitLines(text);
  const mask = commentMask(lines);
  const { index, cells } = findGateRow(lines, mask, gate);
  lines[index] = joinCells([cells[0], cells[1], escapeCell(status), escapeCell(record)]);
  return lines.join(eol);
}

/** gate サブコマンドが書く状態と記録のセルを作る。 */
export function buildGateCells({ record, na }, today) {
  if (na !== null && na !== undefined) {
    return { status: `該当なし（${oneLine(na)}）`, record: record ? `${today} / ${record}` : today };
  }
  return { status: '承認済み', record: `${today} / ${record}` };
}

/** 現在地の節のコメントにある「区間の終わりの定型」の表を読む。 */
export function parseTransitions(text) {
  const { lines } = splitLines(text);
  const mask = commentMask(lines);
  const sec = findSection(lines, mask, CURRENT_SECTION);
  const rows = [];
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (!mask[i] || !lines[i].trim().startsWith('|')) continue;
    const cells = splitCells(lines[i]);
    if (cells.length !== 5 || cells[0] === '移行' || /^:?-+:?$/.test(cells[0])) continue;
    rows.push({ name: cells[0], section: cells[1], command: cells[2], model: cells[3], branch: cells[4] });
  }
  return rows;
}

/** 現在地の4行を、定型の行で書く。移行は `A→B` のように（`A→C（UI もテーブル変更も無い）` は `A→C` でも指せる）。 */
export function applyTransition(text, name) {
  const rows = parseTransitions(text);
  if (rows.length === 0) throw new HandoffError('現在地の節のコメントに「区間の終わりの定型」の表が無い');
  const row = rows.find((r) => r.name === name) ?? rows.find((r) => r.name.startsWith(`${name}（`));
  if (!row) throw new HandoffError(`移行「${name}」が定型に無い。候補: ${rows.map((r) => r.name).join(' / ')}`);
  let out = setKey(text, CURRENT_SECTION, '区間', row.section);
  out = setKey(out, CURRENT_SECTION, '次に起動するコマンド', row.command);
  out = setKey(out, CURRENT_SECTION, '推奨モデル', row.model);
  out = setKey(out, CURRENT_SECTION, 'ブランチ', row.branch);
  return out;
}

/** 節の表の最後の行の後ろに1行足す。列数が見出しの行と違うと HandoffError(2)。 */
export function appendRow(text, section, cells) {
  const { lines, eol } = splitLines(text);
  const mask = commentMask(lines);
  const sec = findSection(lines, mask, section);
  const tableLines = [];
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (!mask[i] && lines[i].trim().startsWith('|')) tableLines.push(i);
  }
  if (tableLines.length === 0) throw new HandoffError(`節「${section}」に表が無い`);
  const width = splitCells(lines[tableLines[0]]).length;
  if (cells.length !== width) throw new HandoffError(`列数が違う: 節「${section}」の表は ${width} 列、渡されたのは ${cells.length} 列`);
  lines.splice(tableLines[tableLines.length - 1] + 1, 0, joinCells(cells.map(escapeCell)));
  return lines.join(eol);
}

/** 節に箇条を1行足す。内容のある最後の行の後ろ。無ければコメントの後ろ、それも無ければ見出しの後ろ。 */
export function appendNote(text, section, note) {
  const { lines, eol } = splitLines(text);
  const mask = commentMask(lines);
  const sec = findSection(lines, mask, section);
  let lastContent = -1;
  let lastComment = -1;
  for (let i = sec.start + 1; i < sec.end; i++) {
    if (mask[i]) lastComment = i;
    else if (lines[i].trim() !== '') lastContent = i;
  }
  const at = (lastContent >= 0 ? lastContent : lastComment >= 0 ? lastComment : sec.start) + 1;
  const body = oneLine(note).trim();
  lines.splice(at, 0, body.startsWith('- ') ? body : `- ${body}`);
  return lines.join(eol);
}

// ---- ゲートの照合 ----

/** 記録の先頭にあるコミットのハッシュ（7〜40桁の16進）を取り出す。純関数。 */
export function extractHash(text) {
  const m = /^([0-9a-f]{7,40})(?![0-9A-Za-z])/.exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

/** `YYYY-MM-DD / <記録>` を日付・残り・ハッシュに分ける。純関数。 */
export function parseRecord(record) {
  const s = String(record ?? '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})(?:\s*\/\s*(.*))?$/.exec(s);
  if (!m) return { date: null, rest: s, hash: extractHash(s) };
  const rest = m[2] ?? '';
  return { date: m[1], rest, hash: extractHash(rest) };
}

/** 状態のセルを分類する。純関数。 */
export function classifyStatus(status) {
  const s = String(status ?? '').trim();
  if (s.startsWith('承認済み')) return 'approved';
  if (s.startsWith('該当なし')) return 'na';
  return 'pending';
}

/**
 * ゲートの成果物かどうかを判定する関数を返す。純関数。成果物を持たないゲート（E-1・E-2）は null。
 * @param {string} specDir 例: `specs/004-solver-ui`
 */
export function artifactMatcher(gate, specDir) {
  const f = (name) => `${specDir}/${name}`;
  switch (gate) {
    case 'A-1':
      return (p) => p === f('decisions.md');
    case 'A-2':
      return (p) => p === f('spec.md');
    case 'B-1':
      return (p) => p === f('screen-design.md');
    case 'B-2':
      return (p) => p === 'design/data-model-standard.md' || p === 'design/attributes.yaml' || p.startsWith('db/migration/');
    case 'C-1':
      return (p) => p === f('plan.md') || p === f('tasks.md');
    case 'D-1':
      return (p) => p !== f('handoff.md');
    default:
      return null;
  }
}

/** tasks.md のチェックボックスの状態を揃える（`[x]`・`[X]` を `[ ]` に）。純関数。 */
export function normalizeTasks(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/^(\s*[-*]\s+)\[[xX ]\]/gm, '$1[ ]');
}

/**
 * ゲート記録の行そのものの検査。純関数。
 * @returns {{ok: false, reason: string} | {ok: true, hash: string|null}}
 */
export function checkRowState(gate, row, specDir) {
  const kind = classifyStatus(row.status);
  if (kind === 'pending') return { ok: false, reason: `未承認（状態: ${row.status === '' ? '空' : row.status}）` };
  const hash = parseRecord(row.record).hash;
  const hasArtifacts = artifactMatcher(gate, specDir) !== null;
  if (kind === 'approved' && hasArtifacts && !hash) {
    return { ok: false, reason: `記録にコミットのハッシュが無い（記録: ${row.record === '' ? '空' : row.record}。「YYYY-MM-DD / <短縮ハッシュ>」の形で書く）` };
  }
  return { ok: true, hash };
}

// ---- git ----

function git(root, args) {
  return spawnSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function gitRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8' });
  if (r.status !== 0) throw new HandoffError('git リポジトリの中で実行してください');
  return path.resolve(r.stdout.trim());
}

function hashExists(root, hash) {
  return git(root, ['cat-file', '-e', `${hash}^{commit}`]).status === 0;
}

function isAncestorOfHead(root, hash) {
  return git(root, ['merge-base', '--is-ancestor', hash, 'HEAD']).status === 0;
}

/** hash から作業ツリーまでに変わったパス（追跡外の新規ファイルを含む）。 */
function changedSince(root, hash) {
  const diff = git(root, ['diff', '--name-only', '-z', '--no-renames', hash, '--']);
  if (diff.status !== 0) throw new HandoffError(`git diff に失敗しました: ${diff.stderr}`, 2);
  const others = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (others.status !== 0) throw new HandoffError(`git ls-files に失敗しました: ${others.stderr}`, 2);
  return [...new Set([...diff.stdout.split('\0'), ...others.stdout.split('\0')].filter(Boolean))];
}

function showAt(root, hash, filePath) {
  const r = git(root, ['show', `${hash}:${filePath}`]);
  return r.status === 0 ? r.stdout : null;
}

/** 1つのゲートを照合する。 */
function evaluateGate(root, specDir, gate, text) {
  const row = readGateRow(text, gate);
  const state = checkRowState(gate, row, specDir);
  if (!state.ok) return state;
  const matcher = artifactMatcher(gate, specDir);
  if (!matcher || !state.hash) return { ok: true, note: row.status };
  const hash = state.hash;
  if (!hashExists(root, hash)) return { ok: false, reason: `記録のハッシュ ${hash} が git に実在しない` };
  if (!isAncestorOfHead(root, hash)) return { ok: false, reason: `記録のハッシュ ${hash} が HEAD の履歴に無い` };
  const tasksPath = `${specDir}/tasks.md`;
  const changed = changedSince(root, hash)
    .filter(matcher)
    .filter((p) => {
      if (p !== tasksPath) return true;
      const before = showAt(root, hash, p);
      const abs = path.join(root, p);
      if (before === null || !existsSync(abs)) return true;
      return normalizeTasks(before) !== normalizeTasks(readFileSync(abs, 'utf8'));
    });
  if (changed.length > 0) {
    const shown = changed.slice(0, 8).join('・');
    return { ok: false, reason: `ハッシュ ${hash} の後に成果物が変わった: ${shown}${changed.length > 8 ? ` ほか ${changed.length - 8} 件` : ''}` };
  }
  return { ok: true, note: `${row.status}（${hash} から変更なし）` };
}

// ---- 実行 ----

function run(opts) {
  const root = gitRoot();
  const specsDir = path.join(root, 'specs');
  if (!existsSync(specsDir)) throw new HandoffError('specs/ がありません');
  const names = readdirSync(specsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const slugDir = matchSpecDir(names, opts.nnn);
  const specDir = `specs/${slugDir}`;
  const handoffPath = path.join(root, specDir, 'handoff.md');
  if (!existsSync(handoffPath)) throw new HandoffError(`${specDir}/handoff.md がありません`);
  const text = readFileSync(handoffPath, 'utf8');

  const save = (next, message) => {
    if (next !== text) writeFileSync(handoffPath, next);
    console.log(message);
  };

  switch (opts.cmd) {
    case 'gate': {
      const hash = opts.record ? extractHash(opts.record) : null;
      if (hash && !hashExists(root, hash)) throw new HandoffError(`記録のハッシュ ${hash} が git に実在しません`, 1);
      const { status, record } = buildGateCells(opts, formatDate());
      save(setGate(text, opts.gate, status, record), `${specDir}/handoff.md: ${opts.gate} を「${status}」にしました（${record}）`);
      return 0;
    }
    case 'check': {
      let failed = 0;
      for (const gate of opts.gates) {
        const r = evaluateGate(root, specDir, gate, text);
        if (r.ok) console.log(`OK ${gate}: ${r.note}`);
        else {
          failed++;
          console.log(`NG ${gate}: ${r.reason}`);
        }
      }
      return failed > 0 ? 1 : 0;
    }
    case 'set':
      save(setKey(text, opts.section, opts.key, opts.value), `${specDir}/handoff.md: 「${opts.section}」の ${opts.key} を書き換えました`);
      return 0;
    case 'transition':
      save(applyTransition(text, opts.transition), `${specDir}/handoff.md: 現在地を ${opts.transition} の定型にしました`);
      return 0;
    case 'row':
      save(appendRow(text, opts.section, opts.cells), `${specDir}/handoff.md: 「${opts.section}」に1行追記しました`);
      return 0;
    default:
      save(appendNote(text, opts.section, opts.text), `${specDir}/handoff.md: 「${opts.section}」に箇条を追記しました`);
      return 0;
  }
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof HandoffError)) throw err;
    console.error(err.message);
    console.error(USAGE);
    process.exit(2);
  }
  try {
    process.exit(run(opts));
  } catch (err) {
    if (!(err instanceof HandoffError)) throw err;
    console.error(err.message);
    process.exit(err.exitCode);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}

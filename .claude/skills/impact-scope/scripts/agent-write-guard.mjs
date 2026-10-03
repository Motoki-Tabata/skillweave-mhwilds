#!/usr/bin/env node
// impact-scope: agent-write-guard（PreToolUse／PostToolUse ハンドラ）。
// 呼出し（PreToolUse・PostToolUse とも同じ形）:
//   node "${CLAUDE_PROJECT_DIR}/.claude/skills/impact-scope/scripts/agent-write-guard.mjs" <ロール名>
// イベントは stdin の hook_event_name で判別する（無ければ PreToolUse として扱う）。
// PreToolUse: Write/Edit/NotebookEdit と Bash の書込先を許可表と突き合わせ、外れれば deny。
// PostToolUse（Bash のみ）: 実行前後の git 差分を比べ、許可フォルダ外の変化があれば block で通知する。
// Node ESM・依存ゼロ・Node 20+。fail-closed: どこかで例外が出たら deny。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analyzeBashCommand, diffSnapshots, impliedCoverage, takeSnapshot } from './bash-write.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit'];

/**
 * write-scopes.json を読み込む。純関数（呼出し側が例外を処理する）。
 */
export function loadScopes(scopesPath) {
  const raw = fs.readFileSync(scopesPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * glob を正規表現に変換する。二重アスタリスク＝0個以上のディレクトリ（任意文字列、スラッシュを含んでよい）、
 * 単一アスタリスク＝スラッシュを含まない任意文字列、それ以外はリテラル。
 */
export function globToRegExp(glob, { caseInsensitive = false } = {}) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 1;
    } else if (glob[i] === '*') {
      re += '[^/]*';
    } else {
      re += glob[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  const flags = caseInsensitive ? 'i' : '';
  return new RegExp('^' + re + '$', flags);
}

function denyReason(role, relativePathOrDetail, globs) {
  const globList = Array.isArray(globs) && globs.length > 0 ? globs.join(', ') : '(該当ロールの許可 glob なし)';
  return (
    `${role} の書込許可フォルダ外です: ${relativePathOrDetail}。許可: ${globList}。` +
    `担当フォルダ外の変更が必要なら書かずに停止し、対象パスと理由をメインへ報告してください` +
    `（別名ファイルでの迂回は禁止）。定義: .claude/skills/impact-scope/SKILL.md`
  );
}

function resolveRealAncestor(targetPath, realpath) {
  let current = path.normalize(targetPath);
  const trailing = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const real = realpath(current);
      return trailing.length > 0 ? path.join(real, ...trailing.reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return path.normalize(targetPath);
      }
      trailing.push(path.basename(current));
      current = parent;
    }
  }
}

// 1つのパスを許可表と突き合わせる（絶対化・realpath 祖先解決・root 外は一時ディレクトリだけ allow・glob 照合）。
function checkPath(rawPath, { role, globs, root, tmpdir, platform, realpath }) {
  const isWin = platform === 'win32';
  const normalizedInput = isWin ? String(rawPath).replace(/\\/g, '/') : String(rawPath);
  const absTarget = path.isAbsolute(normalizedInput)
    ? path.normalize(normalizedInput)
    : path.normalize(path.join(root, normalizedInput));

  const resolvedTarget = resolveRealAncestor(absTarget, realpath);
  const resolvedRoot = resolveRealAncestor(root, realpath);

  let relative = path.relative(resolvedRoot, resolvedTarget);
  relative = relative.split(path.sep).join('/');
  const outsideRoot = relative.startsWith('..') || path.isAbsolute(relative);

  if (outsideRoot) {
    const resolvedTmp = resolveRealAncestor(tmpdir || os.tmpdir(), realpath);
    let relToTmp = path.relative(resolvedTmp, resolvedTarget);
    relToTmp = relToTmp.split(path.sep).join('/');
    const insideTmp = !relToTmp.startsWith('..') && !path.isAbsolute(relToTmp);
    if (insideTmp) {
      return { decision: 'allow', reason: '' };
    }
    return { decision: 'deny', reason: denyReason(role, relative, globs) };
  }

  const matched = globs.some((g) => globToRegExp(g, { caseInsensitive: isWin }).test(relative));
  if (matched) {
    return { decision: 'allow', reason: '' };
  }
  return { decision: 'deny', reason: denyReason(role, relative === '' ? '(リポジトリ root)' : relative, globs) };
}

// Bash の実行ディレクトリを root 相対（root 外なら絶対パス）にする。
function cwdToRel(cwd, { root, platform, realpath }) {
  if (!cwd) return '';
  const raw = platform === 'win32' ? String(cwd).replace(/\\/g, '/') : String(cwd);
  const absCwd = path.isAbsolute(raw) ? path.normalize(raw) : path.normalize(path.join(root, raw));
  const resolvedCwd = resolveRealAncestor(absCwd, realpath);
  const resolvedRoot = resolveRealAncestor(root, realpath);
  const rel = path.relative(resolvedRoot, resolvedCwd).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) return resolvedCwd.split(path.sep).join('/');
  return rel;
}

function decideBash({ toolInput, role, globs, root, tmpdir, platform, realpath, cwd }) {
  const command = toolInput && toolInput.command;
  if (typeof command !== 'string') {
    return { decision: 'deny', reason: denyReason(role, 'Bash の command が文字列ではありません', globs) };
  }
  if (!root) {
    return { decision: 'deny', reason: denyReason(role, 'リポジトリ root を特定できません', globs) };
  }
  const cwdRel = cwdToRel(cwd || root, { root, platform, realpath });
  const analysis = analyzeBashCommand(command, { cwdRel });

  if (analysis.unanalyzable.length > 0) {
    const detail = analysis.unanalyzable.map((u) => u.reason).join(' / ');
    return {
      decision: 'deny',
      reason:
        `${role} の Bash は書込先を静的に特定できないため deny します: ${detail}。` +
        `ファイルの作成・編集は Write/Edit を使ってください。定義: .claude/skills/impact-scope/SKILL.md`,
    };
  }
  if (analysis.forbidden.length > 0) {
    const detail = analysis.forbidden.map((f) => f.reason).join(' / ');
    return {
      decision: 'deny',
      reason:
        `${role} の Bash に禁止コマンドがあります: ${detail}。` +
        `定義: .claude/skills/impact-scope/SKILL.md の「禁止コマンド（全ロール共通）」。ブランチ操作・依存追加はメインの担当です`,
    };
  }

  const ctx = { role, globs, root, tmpdir, platform, realpath };
  for (const w of analysis.writes) {
    const r = checkPath(w.path === '' ? '.' : w.path, ctx);
    if (r.decision === 'deny') {
      return { decision: 'deny', reason: r.reason.replace('書込許可フォルダ外です:', `書込許可フォルダ外です（${w.via}）:`) };
    }
  }

  // 暗黙の書込先は、コマンド（via）ごとに「まったく重ならない」ときだけ deny する。一部でも重なれば事後照合に委ねる。
  const groups = new Map();
  for (const im of analysis.implied) {
    if (im.prefix.startsWith('..') || path.isAbsolute(im.prefix)) {
      const r = checkPath(im.prefix === '' ? '.' : im.prefix, ctx);
      if (r.decision === 'deny') return r;
      continue;
    }
    if (!groups.has(im.via)) groups.set(im.via, []);
    groups.get(im.via).push(im.prefix);
  }
  for (const [via, prefixes] of groups) {
    const allNone = prefixes.every((p) => impliedCoverage(p, globs) === 'none');
    if (allNone) {
      return { decision: 'deny', reason: denyReason(role, `${prefixes.join(', ')}（${via} の暗黙の書込先）`, globs) };
    }
  }
  return { decision: 'allow', reason: '' };
}

/**
 * 判定の実体。純関数（fs を使うのは realpath の注入口 `realpath` だけ）。
 * `cwd` は Bash の相対パスの基準（省略時は root）。
 * @returns {{decision: 'allow'|'deny', reason: string}}
 */
export function decide({ toolName, toolInput, role, root, scopes, tmpdir, platform, realpath = fs.realpathSync, cwd }) {
  try {
    if (!scopes || !scopes.roles || !Object.prototype.hasOwnProperty.call(scopes.roles, role)) {
      return { decision: 'deny', reason: denyReason(role ?? '(不明)', '許可表に登録の無いロールです', []) };
    }
    const globs = scopes.roles[role];

    if (toolName === 'Bash') {
      return decideBash({ toolInput, role, globs, root, tmpdir, platform, realpath, cwd });
    }

    if (!WRITE_TOOLS.includes(toolName)) {
      return { decision: 'allow', reason: '' };
    }

    const targetPathRaw =
      toolName === 'NotebookEdit'
        ? (toolInput && (toolInput.notebook_path || toolInput.file_path))
        : toolInput && toolInput.file_path;
    if (!targetPathRaw) {
      return { decision: 'deny', reason: denyReason(role, '対象パス（file_path）が指定されていません', globs) };
    }

    if (!root) {
      return { decision: 'deny', reason: denyReason(role, 'リポジトリ root を特定できません', globs) };
    }

    return checkPath(targetPathRaw, { role, globs, root, tmpdir, platform, realpath });
  } catch (err) {
    return {
      decision: 'deny',
      reason: denyReason(role ?? '(不明)', `内部エラー: ${err.message}`, (scopes && scopes.roles && scopes.roles[role]) || []),
    };
  }
}

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emitJson(payload) {
  try {
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`agent-write-guard: 出力に失敗しました: ${err.message}\n`);
    process.exit(2);
  }
}

function emitDeny(reason) {
  emitJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

function emitPostContext(message) {
  emitJson({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } });
}

function sanitizeKey(s) {
  return String(s).replace(/[^A-Za-z0-9_.-]/g, '_');
}

// スナップショットの保存先。session_id・tool_use_id があればそれをキーにし、無ければ command と session_id の sha1 をキーにする。
function snapshotFile(input) {
  const sid = input.session_id ? sanitizeKey(input.session_id) : 'nosession';
  let key;
  if (input.session_id && input.tool_use_id) {
    key = sanitizeKey(input.tool_use_id);
  } else {
    const command = input.tool_input && input.tool_input.command;
    key = crypto.createHash('sha1').update(`${String(command)}\0${String(input.session_id)}`).digest('hex');
  }
  return path.join(os.tmpdir(), 'agent-write-guard', sid, `${key}.json`);
}

function runPre(role, input) {
  let scopes = null;
  try {
    scopes = loadScopes(path.join(__dirname, '../write-scopes.json'));
  } catch (err) {
    emitDeny(denyReason(role ?? '(不明)', `write-scopes.json を読み込めません: ${err.message}`, []));
    return;
  }

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  const result = decide({
    toolName: input.tool_name,
    toolInput: input.tool_input,
    role,
    root,
    scopes,
    tmpdir: os.tmpdir(),
    platform: process.platform,
    cwd: input.cwd,
  });

  if (result.decision === 'deny') {
    emitDeny(result.reason);
    return;
  }

  // Bash を allow したときは、事後照合のために実行前のスナップショットを保存する。失敗しても allow は妨げない。
  if (input.tool_name === 'Bash') {
    try {
      const snap = takeSnapshot(root);
      if (snap.ok) {
        const file = snapshotFile(input);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(snap));
      }
    } catch {
      // 保存に失敗したら、事後で「照合できなかった」と通知される。
    }
  }
  // allow のときは何も出力しない。
  process.exit(0);
}

function runPost(role, input) {
  if (input.tool_name !== 'Bash') {
    process.exit(0);
    return;
  }
  const notCheckedMessage = (why) =>
    `${role} の Bash 実行後の照合ができませんでした（${why}）。` +
    `git status で担当外の変化が無いか確かめ、あれば書き戻さずにメインへ報告してください。定義: .claude/skills/impact-scope/SKILL.md`;

  let scopes = null;
  try {
    scopes = loadScopes(path.join(__dirname, '../write-scopes.json'));
  } catch (err) {
    emitPostContext(notCheckedMessage(`write-scopes.json を読み込めません: ${err.message}`));
    return;
  }
  if (!scopes || !scopes.roles || !Object.prototype.hasOwnProperty.call(scopes.roles, role)) {
    emitPostContext(notCheckedMessage('許可表に登録の無いロールです'));
    return;
  }
  const globs = scopes.roles[role];
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd;
  if (!root) {
    emitPostContext(notCheckedMessage('リポジトリ root を特定できません'));
    return;
  }

  let before = null;
  const file = snapshotFile(input);
  try {
    before = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    emitPostContext(notCheckedMessage('実行前のスナップショットが見つかりません'));
    return;
  }
  try {
    fs.unlinkSync(file);
  } catch {
    // 削除に失敗しても照合は続ける。
  }

  const after = takeSnapshot(root);
  if (!after.ok) {
    emitPostContext(notCheckedMessage(after.error));
    return;
  }
  const isWin = process.platform === 'win32';
  const outside = diffSnapshots(before, after).filter(
    (p) => !globs.some((g) => globToRegExp(g, { caseInsensitive: isWin }).test(p)),
  );
  if (outside.length === 0) {
    process.exit(0);
    return;
  }
  const reason =
    `${role} の Bash 実行で書込許可フォルダ外が変化しました: ${outside.join(', ')}。` +
    `書き戻さずに作業を止め、実行したコマンドと対象パスをメインへ報告してください。` +
    `並行作業による変化かもしれない場合も、完了報告の『担当外の変化』に列挙してください。` +
    `定義: .claude/skills/impact-scope/SKILL.md`;
  emitJson({
    decision: 'block',
    reason,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reason },
  });
}

function main() {
  const role = process.argv[2];
  const input = readStdinJson();
  const isPost = Boolean(input) && input.hook_event_name === 'PostToolUse';
  if (!input) {
    emitDeny(denyReason(role ?? '(不明)', 'stdin を JSON として読めません', []));
    return;
  }
  if (isPost) {
    runPost(role, input);
    return;
  }
  runPre(role, input);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}

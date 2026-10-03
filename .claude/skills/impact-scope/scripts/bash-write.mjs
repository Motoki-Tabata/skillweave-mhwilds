// impact-scope: bash-write（Bash コマンド文字列の書込解析と git 差分スナップショット）。
// CLI を持たない純粋なライブラリ。import しただけでは何も実行しない。
// agent-write-guard.mjs から import される（本ファイルは agent-write-guard.mjs を import しない）。
// Node ESM・Node 組込みモジュールのみ・Node 20+。
// 解析は静的な近似である。事前判定を通った実行の実際の変化は、スナップショットの比較（事後照合）で検出する。

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync as nodeSpawnSync } from 'node:child_process';

// コマンド別の暗黙の書込先・禁止操作の表（データ）。暗黙の書込先はリポジトリ root からの接頭辞で書く。
// コマンド別の暗黙の書込先の正はこの表。impact-scope の guard-internals.md の表は要約である。
export const COMMAND_RULES = {
  // pnpm workspace のパッケージ（名前 → リポジトリ root からのディレクトリ）
  workspace: {
    packages: {
      '@swv/web': 'apps/web',
      '@swv/solver': 'packages/solver',
      '@swv/data': 'packages/data',
    },
  },
  // pnpm [run] <script> の暗黙の書込先。impliedIn は、対象パッケージのディレクトリからの相対接頭辞。
  // 対象パッケージは、--filter の selector・-r・cwd から決める（resolveScriptDirs）。
  pnpmScripts: {
    format: { impliedIn: ['src/'] },
    lint: { impliedIn: [''] },
    'lint:oxlint': { impliedIn: [''] },
    'lint:eslint': { impliedIn: [''] },
    'contract:types': { writes: ['apps/web/src/main/lib/api/schema.ts'] },
  },
  // 依存の追加・更新（ビルド設定ファイルの書換）
  packageManager: {
    pnpmCommands: ['add', 'install', 'i', 'remove', 'rm', 'update', 'up', 'dedupe', 'import'],
    npmCommands: ['install', 'i', 'ci', 'uninstall', 'update'],
    writes: [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'apps/web/package.json',
      'packages/solver/package.json',
      'packages/data/package.json',
    ],
  },
  // gradle / gradlew
  gradle: {
    spotlessTaskPattern: '(^|:)spotless(Java)?Apply$',
    spotlessImplied: ['apps/api/src/'],
    spotlessHookProperty: 'spotlessIdeHook',
    lockFlags: ['--write-locks', '--write-verification-metadata'],
    lockTasks: ['wrapper'],
    lockImplied: ['apps/api/gradle/'],
  },
  // git
  git: {
    pathWriters: ['mv', 'rm'],
    stashReadOnly: ['list', 'show'],
    // branch: 引数付きの作成・削除・改名・複製・上流設定は禁止。一覧（引数なし・--list・--show-current など）は読取り。
    branchValueFlags: ['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format'],
    branchListFlags: ['--list', '-l', '--show-current'],
    branchWriteFlags: [
      '--delete',
      '--move',
      '--copy',
      '--set-upstream-to',
      '--unset-upstream',
      '--edit-description',
      '--force',
      '--track',
      '--no-track',
      '--create-reflog',
    ],
    branchWriteShortChars: 'dDmMcCuft',
    // remote: サブコマンド無し（-v を含む）・show・get-url は読取り。add・remove・set-url・rename などは禁止。
    remoteReadOnly: ['show', 'get-url'],
    // config: 読取りフラグ（または get・list サブコマンド）だけが読取り。書込みフラグがあれば読取りフラグがあっても禁止。設定は禁止。
    configReadFlags: ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'],
    configReadSubcommands: ['get', 'list'],
    configWriteFlags: ['--add', '--replace-all', '--unset', '--unset-all', '--rename-section', '--remove-section', '--edit', '-e', '--set'],
    // branch・remote・config は上の読取り形を除いて禁止（専用の判定で扱う）。tag は読取り形を許さず全体を禁止する。
    forbidden: [
      'stash',
      'checkout',
      'switch',
      'reset',
      'clean',
      'merge',
      'rebase',
      'pull',
      'cherry-pick',
      'revert',
      'am',
      'apply',
      'push',
      'commit',
      'add',
      'tag',
    ],
  },
  // gh: 次のサブコマンド列だけを禁止する（ほかのサブコマンドは変えない）
  gh: {
    forbidden: [['pr', 'merge']],
  },
  // フォーマッタ・リンタ（書込フラグ）
  formatters: {
    prettier: { writeFlags: ['--write', '-w'] },
    eslint: { writeFlags: ['--fix'] },
    oxlint: { writeFlags: ['--fix'] },
  },
  // 引数のパスを書込先にするコマンド
  fileWriters: ['tee', 'sed', 'perl', 'cp', 'install', 'ln', 'rsync', 'mv', 'rm', 'rmdir', 'unlink', 'touch', 'mkdir', 'truncate', 'chmod', 'chown', 'dd'],
};

const SPECIAL_FILES = /^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/;
const LEADING_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', '}']);
const PURE_WRITE_COMMANDS = new Set(['rm', 'rmdir', 'unlink', 'mv', 'cp', 'tee', 'touch', 'mkdir', 'truncate', 'chmod', 'chown', 'dd', 'install', 'ln', 'rsync']);
const SHELL_NAMES = new Set(['bash', 'sh', 'zsh']);
const ARG_FLAGS = {
  cp: ['-t', '-S'],
  install: ['-m', '-o', '-g', '-t', '-S'],
  ln: ['-t', '-S'],
  rsync: ['-e', '--exclude', '--include', '--filter', '--rsh', '--exclude-from', '--include-from'],
  mv: ['-t', '-S'],
  touch: ['-t', '-d', '-r'],
  mkdir: ['-m'],
  truncate: ['-s', '-r'],
  prettier: ['--config', '--ignore-path', '--log-level', '--parser', '--plugin', '--cache-location'],
  eslint: ['--config', '-c', '--ext', '--format', '-f', '--rulesdir', '--ignore-pattern', '--max-warnings', '--cache-location', '--parser', '--plugin', '--output-file', '-o'],
  gradle: ['-p', '--project-dir', '-b', '--build-file', '-c', '--settings-file', '-g', '--gradle-user-dir', '--console', '--max-workers'],
  pnpm: ['-C', '--dir', '--filter', '-F', '--filter-prod', '--workspace-concurrency', '--reporter', '--loglevel'],
};

// ---------------------------------------------------------------------------
// 字句解析
// ---------------------------------------------------------------------------

function matchParen(text, openIdx) {
  let depth = 0;
  for (let j = openIdx; j < text.length; j++) {
    const c = text[j];
    if (c === "'") {
      const e = text.indexOf("'", j + 1);
      if (e < 0) return text.length;
      j = e;
    } else if (c === '"') {
      j += 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
    } else if (c === '(') {
      depth += 1;
    } else if (c === ')') {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  return text.length;
}

function readHeredocBodies(text, start, pending) {
  let i = start;
  for (const obj of pending) {
    let body = '';
    while (i < text.length) {
      let eol = text.indexOf('\n', i);
      const last = eol < 0;
      if (last) eol = text.length;
      const line = text.slice(i, eol);
      i = last ? text.length : eol + 1;
      const cmp = obj.strip ? line.replace(/^\t+/, '') : line;
      if (cmp === obj.delim) {
        obj.done = true;
        break;
      }
      body += line + '\n';
    }
    obj.body = body;
  }
  return i;
}

function lex(text) {
  const items = [];
  const pending = [];
  const n = text.length;
  let unterminated = false;
  let i = 0;
  let cur = null;

  const startWord = () => {
    if (!cur) cur = { text: '', dynamic: false, quoted: false, tilde: false };
  };
  const flush = () => {
    if (cur) {
      items.push({ type: 'word', text: cur.text, dynamic: cur.dynamic, quoted: cur.quoted, tilde: cur.tilde });
      cur = null;
    }
  };
  const takeFdOrFlush = () => {
    if (cur && !cur.quoted && /^\d+$/.test(cur.text)) {
      cur = null;
    } else {
      flush();
    }
  };

  while (i < n) {
    const c = text[i];

    if (c === '\\') {
      if (text[i + 1] === '\n') {
        i += 2;
        continue;
      }
      startWord();
      cur.quoted = true;
      cur.text += text[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (c === "'") {
      startWord();
      cur.quoted = true;
      const end = text.indexOf("'", i + 1);
      if (end < 0) {
        unterminated = true;
        cur.text += text.slice(i + 1);
        i = n;
      } else {
        cur.text += text.slice(i + 1, end);
        i = end + 1;
      }
      continue;
    }
    if (c === '"') {
      startWord();
      cur.quoted = true;
      i += 1;
      let closed = false;
      while (i < n) {
        const d = text[i];
        if (d === '\\') {
          const nx = text[i + 1];
          if (nx === '"' || nx === '\\' || nx === '$' || nx === '`') cur.text += nx;
          else if (nx !== '\n') cur.text += d + (nx ?? '');
          i += 2;
          continue;
        }
        if (d === '"') {
          closed = true;
          i += 1;
          break;
        }
        if (d === '$' && text[i + 1] === '(') {
          const e = matchParen(text, i + 1);
          cur.dynamic = true;
          cur.text += text.slice(i, e);
          i = e;
          continue;
        }
        if (d === '`') {
          const e = text.indexOf('`', i + 1);
          const end = e < 0 ? n : e + 1;
          cur.dynamic = true;
          cur.text += text.slice(i, end);
          i = end;
          continue;
        }
        if (d === '$') cur.dynamic = true;
        cur.text += d;
        i += 1;
      }
      if (!closed) unterminated = true;
      continue;
    }
    if (c === '$') {
      startWord();
      cur.dynamic = true;
      if (text[i + 1] === '(') {
        const e = matchParen(text, i + 1);
        cur.text += text.slice(i, e);
        i = e;
      } else if (text[i + 1] === '{') {
        const e = text.indexOf('}', i + 1);
        const end = e < 0 ? n : e + 1;
        cur.text += text.slice(i, end);
        i = end;
      } else {
        cur.text += c;
        i += 1;
      }
      continue;
    }
    if (c === '`') {
      startWord();
      const e = text.indexOf('`', i + 1);
      const end = e < 0 ? n : e + 1;
      cur.dynamic = true;
      cur.text += text.slice(i, end);
      i = end;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      flush();
      i += 1;
      continue;
    }
    if (c === '#' && !cur) {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '\n') {
      flush();
      items.push({ type: 'op', op: '\n' });
      i += 1;
      if (pending.length > 0) {
        i = readHeredocBodies(text, i, pending);
        pending.length = 0;
      }
      continue;
    }
    if (c === ';') {
      flush();
      items.push({ type: 'op', op: ';' });
      i += 1;
      continue;
    }
    if (c === '|') {
      flush();
      if (text[i + 1] === '|') {
        items.push({ type: 'op', op: '||' });
        i += 2;
      } else if (text[i + 1] === '&') {
        items.push({ type: 'op', op: '|' });
        i += 2;
      } else {
        items.push({ type: 'op', op: '|' });
        i += 1;
      }
      continue;
    }
    if (c === '&') {
      if (text[i + 1] === '&') {
        flush();
        items.push({ type: 'op', op: '&&' });
        i += 2;
      } else if (text[i + 1] === '>') {
        flush();
        i += 2;
        if (text[i] === '>') i += 1;
        items.push({ type: 'redir', op: '>' });
      } else {
        flush();
        items.push({ type: 'op', op: '&' });
        i += 1;
      }
      continue;
    }
    if (c === '(' || c === ')') {
      flush();
      items.push({ type: 'op', op: c });
      i += 1;
      continue;
    }
    if ((c === '>' || c === '<') && text[i + 1] === '(') {
      startWord();
      cur.dynamic = true;
      const e = matchParen(text, i + 1);
      cur.text += text.slice(i, e);
      i = e;
      continue;
    }
    if (c === '>') {
      takeFdOrFlush();
      let op = '>';
      i += 1;
      if (text[i] === '>') {
        op = '>>';
        i += 1;
      } else if (text[i] === '|') {
        i += 1;
      } else if (text[i] === '&') {
        const nx = text[i + 1];
        if (nx && /[\d-]/.test(nx)) {
          i += 2;
          while (i < n && /\d/.test(text[i])) i += 1;
          items.push({ type: 'redir', op: 'dup' });
          continue;
        }
        i += 1;
      }
      items.push({ type: 'redir', op });
      continue;
    }
    if (c === '<') {
      takeFdOrFlush();
      if (text[i + 1] === '<' && text[i + 2] === '<') {
        i += 3;
        items.push({ type: 'redir', op: 'herestr' });
        continue;
      }
      if (text[i + 1] === '<') {
        i += 2;
        let strip = false;
        if (text[i] === '-') {
          strip = true;
          i += 1;
        }
        while (text[i] === ' ' || text[i] === '\t') i += 1;
        let delim = '';
        while (i < n && !/[\s;|&()<>]/.test(text[i])) {
          const d = text[i];
          if (d === "'" || d === '"') {
            const e = text.indexOf(d, i + 1);
            const end = e < 0 ? n : e;
            delim += text.slice(i + 1, end);
            i = e < 0 ? n : e + 1;
          } else if (d === '\\') {
            i += 1;
            delim += text[i] ?? '';
            i += 1;
          } else {
            delim += d;
            i += 1;
          }
        }
        const obj = { delim, strip, body: '', done: false };
        pending.push(obj);
        items.push({ type: 'redir', op: 'heredoc', obj });
        continue;
      }
      i += 1;
      if (text[i] === '&') i += 1;
      items.push({ type: 'redir', op: '<' });
      continue;
    }

    startWord();
    if (cur.text === '' && c === '~') cur.tilde = true;
    cur.text += c;
    i += 1;
  }
  flush();
  return { items, unterminated };
}

function buildEvents(items) {
  const events = [];
  let words = [];
  let redirs = [];
  const flushSeg = () => {
    if (words.length > 0 || redirs.length > 0) events.push({ kind: 'seg', words, redirs });
    words = [];
    redirs = [];
  };
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (it.type === 'word') {
      if (words.length === 0 && !it.quoted && LEADING_KEYWORDS.has(it.text)) continue;
      words.push(it);
    } else if (it.type === 'redir') {
      if (it.op === 'dup') continue;
      if (it.op === 'heredoc') {
        redirs.push({ op: 'heredoc', obj: it.obj });
        continue;
      }
      const next = items[k + 1];
      if (next && next.type === 'word') {
        k += 1;
        if (it.op === '>' || it.op === '>>') redirs.push({ op: it.op, target: next });
      }
    } else if (it.op === '(') {
      flushSeg();
      events.push({ kind: 'open' });
    } else if (it.op === ')') {
      flushSeg();
      events.push({ kind: 'close' });
    } else {
      flushSeg();
    }
  }
  flushSeg();
  return events;
}

// ---------------------------------------------------------------------------
// パス・引数のヘルパー
// ---------------------------------------------------------------------------

function resolveRel(cwd, p) {
  if (path.posix.isAbsolute(p)) return path.posix.normalize(p);
  const joined = path.posix.normalize(path.posix.join(cwd || '.', p || '.'));
  return joined === '.' ? '' : joined;
}

function expandTilde(w) {
  const t = w.text;
  if (w.tilde && (t === '~' || t.startsWith('~/'))) {
    return os.homedir().split(path.sep).join('/') + t.slice(1);
  }
  return t;
}

function withValue(orig, value) {
  return { text: value, dynamic: orig.dynamic, quoted: orig.quoted, tilde: false };
}

function parseArgs(args, argFlags = []) {
  const positional = [];
  const flags = [];
  const opts = {};
  let endFlags = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const t = a.text;
    if (!endFlags && t === '--') {
      endFlags = true;
      continue;
    }
    if (!endFlags && t.length > 1 && t[0] === '-') {
      flags.push(t);
      if (argFlags.includes(t)) {
        const v = args[i + 1];
        if (v) {
          opts[t] = v;
          i += 1;
        }
      } else if (t.startsWith('--') && t.indexOf('=') > 0) {
        const eq = t.indexOf('=');
        opts[t.slice(0, eq)] = withValue(a, t.slice(eq + 1));
      }
      continue;
    }
    positional.push(a);
  }
  return { positional, flags, opts };
}

function relUnusable(state, text) {
  return state.unknown && !path.posix.isAbsolute(text);
}

function addWrite(state, word, res, via) {
  if (word.dynamic) {
    res.unanalyzable.push({ reason: `書込先に変数・コマンド置換を含みます: ${word.text}（${via}）` });
    return;
  }
  const p = expandTilde(word);
  if (p === '' || SPECIAL_FILES.test(p)) return;
  if (relUnusable(state, p)) {
    res.unanalyzable.push({ reason: `動的な cd の後の相対パスです: ${p}（${via}）` });
    return;
  }
  res.writes.push({ path: resolveRel(state.cwd, p), via });
}

function addFixedWrite(res, p, via) {
  res.writes.push({ path: p, via });
}

function addImplied(res, prefix, via) {
  res.implied.push({ prefix, via });
}

function dirPrefix(state, dirText) {
  const r = resolveRel(state.cwd, dirText || '.');
  if (r === '') return '';
  return r.endsWith('/') ? r : r + '/';
}

// フォーマッタ・リンタの引数を、明示のファイル（writes）かディレクトリ接頭辞（implied）に振り分ける。
function classifyTarget(state, word, res, via) {
  if (word.dynamic) {
    res.unanalyzable.push({ reason: `対象に変数・コマンド置換を含みます: ${word.text}（${via}）` });
    return;
  }
  const t = expandTilde(word);
  if (relUnusable(state, t)) {
    res.unanalyzable.push({ reason: `動的な cd の後の相対パスです: ${t}（${via}）` });
    return;
  }
  const wild = t.search(/[*?[{]/);
  if (wild >= 0) {
    const head = t.slice(0, wild);
    const dir = head.slice(0, head.lastIndexOf('/') + 1);
    addImplied(res, dirPrefix(state, dir), via);
    return;
  }
  const base = path.posix.basename(t);
  if (t === '.' || t.endsWith('/') || !base.includes('.')) {
    addImplied(res, dirPrefix(state, t), via);
    return;
  }
  addWrite(state, word, res, via);
}

const WRITE_API_PATTERNS = [
  /\bopen\s*\([^)]*,\s*['"][rwaxbt+]*[wax+][rwaxbt+]*['"]/,
  /\bopen\s*\([^)]*mode\s*=\s*['"][^'"]*[wax+]/,
  /\bopen\s*\(?[^;\n]*['"]\s*[>+]/,
  /\b(write_text|write_bytes|writeFileSync|writeFile|appendFile|appendFileSync|createWriteStream|copyFile|copyFileSync|rename|renameSync|unlink|unlinkSync|rmSync|rmdirSync|mkdirSync|truncateSync)\b/,
  /\bshutil\./,
  /\bos\.(remove|rename|unlink|makedirs|mkdir|rmdir|replace)\b/,
  /\bFile\.(write|delete|rename|unlink)\b/,
];

function checkWriteApi(code, res, via) {
  if (WRITE_API_PATTERNS.some((re) => re.test(code))) {
    res.unanalyzable.push({ reason: `インライン実行のコードにファイル書込 API があります（${via}）` });
  }
}

// ---------------------------------------------------------------------------
// pnpm workspace の対象パッケージの解決
// ---------------------------------------------------------------------------

function simpleGlob(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i += 1;
    } else if (pattern[i] === '*') {
      re += '[^/]*';
    } else {
      re += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

function allPackageDirs() {
  return Object.values(COMMAND_RULES.workspace.packages);
}

/**
 * `--filter` の selector 一覧から、対象パッケージのディレクトリ（リポジトリ root 相対）を決める。純関数。
 * パッケージ名（`@swv/web`）・名前の glob（`@swv/*`）・パスの glob（`./packages/*`・`./apps/web`・`{./apps/web}`）を解く。
 * 依存グラフ修飾（`...`・`^`）・除外（`!`）・変更範囲（`[...]`）・解決できない selector が1つでもあれば、全パッケージとみなす。
 * selector が空のときも全パッケージ。
 * @param {string[]} selectors
 * @returns {string[]}
 */
export function resolvePackageDirs(selectors) {
  const all = allPackageDirs();
  if (!selectors || selectors.length === 0) return all;
  const hit = new Set();
  for (const raw of selectors) {
    const s = String(raw);
    if (s.startsWith('...') || s.endsWith('...') || s.includes('^') || s.startsWith('!') || /\[.*\]/.test(s)) return all;
    const sel = s
      .replace(/^\{(.*)\}$/, '$1')
      .replace(/^\.\//, '')
      .replace(/\/$/, '');
    const re = simpleGlob(sel);
    let matched = false;
    for (const [name, dir] of Object.entries(COMMAND_RULES.workspace.packages)) {
      if (re.test(name) || re.test(dir)) {
        hit.add(dir);
        matched = true;
      }
    }
    if (!matched) return all;
  }
  return all.filter((d) => hit.has(d));
}

// pnpm スクリプトの対象パッケージ。--filter があればそれ、-r なら全部、無ければ cwd がパッケージ内ならそのパッケージ、それ以外（リポジトリ直下）は全部。
function resolveScriptDirs(local, selectors, recursive) {
  if (selectors.length > 0) return resolvePackageDirs(selectors);
  const all = allPackageDirs();
  if (!recursive && !local.unknown) {
    const dir = all.find((d) => local.cwd === d || String(local.cwd).startsWith(`${d}/`));
    if (dir) return [dir];
  }
  return all;
}

// ---------------------------------------------------------------------------
// コマンド解析
// ---------------------------------------------------------------------------

function firstNonFlag(words) {
  return words.find((w) => !w.text.startsWith('-'));
}

function isAssignment(w) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.text);
}

// シェル（bash・sh・zsh）の `-c` に渡された文字列の語を返す。シェルでない・`-c` が無い・文字列が無いときは null。
function shellCString(words) {
  if (words.length === 0) return null;
  if (!SHELL_NAMES.has(path.posix.basename(words[0].text))) return null;
  const pa = parseArgs(words.slice(1));
  const hasC = pa.flags.some((f) => !f.startsWith('--') && /^-[a-z]*c[a-z]*$/.test(f));
  return hasC && pa.positional[0] ? pa.positional[0] : null;
}

// xargs・find -exec の後ろのコマンドを解析する。書込に当たるものがあれば、書込先を静的に特定できないとして報告する。
// `sh -c '<文字列>'` は、文字列そのものを同じ解析にかける（書込が無ければ許す）。
// 文字列がまるごと変数・コマンド置換の場合は、実行内容を特定できないので許さない。
function checkSubcommand(words, state, res, depth, label) {
  if (words.length === 0) return;
  const tmp = { writes: [], implied: [], unanalyzable: [], forbidden: [] };
  analyzeCommand(words, { ...state }, tmp, [], depth + 1);
  const name = path.posix.basename(words[0].text);
  const script = shellCString(words);
  const opaqueShell = SHELL_NAMES.has(name) && (!script || (script.dynamic && /^\s*[$`]/.test(script.text)));
  const risky =
    PURE_WRITE_COMMANDS.has(name) ||
    opaqueShell ||
    tmp.writes.length > 0 ||
    tmp.implied.length > 0 ||
    tmp.forbidden.length > 0 ||
    tmp.unanalyzable.length > 0;
  if (risky) {
    res.unanalyzable.push({ reason: `${label} 経由の書込は書込先を静的に特定できません` });
  }
}

function heredocsToScripts(heredocs) {
  return heredocs.map((h) => h.body).filter((b) => typeof b === 'string' && b.length > 0);
}

function analyzeCommand(wordsIn, state, res, heredocs, depth) {
  let ws = wordsIn.slice();
  for (;;) {
    if (ws.length === 0) return;
    if (isAssignment(ws[0])) {
      ws = ws.slice(1);
      continue;
    }
    const n0 = path.posix.basename(ws[0].text);
    if (n0 === 'env') {
      ws = ws.slice(1);
      while (ws.length > 0 && (ws[0].text.startsWith('-') || isAssignment(ws[0]))) {
        ws = ['-u', '-C', '-S'].includes(ws[0].text) ? ws.slice(2) : ws.slice(1);
      }
      continue;
    }
    if (n0 === 'timeout') {
      ws = ws.slice(1);
      while (ws.length > 0 && ws[0].text.startsWith('-')) {
        ws = ['-s', '-k', '--signal', '--kill-after'].includes(ws[0].text) ? ws.slice(2) : ws.slice(1);
      }
      ws = ws.slice(1);
      continue;
    }
    if (n0 === 'nice') {
      ws = ws.slice(1);
      if (ws.length > 0 && ws[0].text === '-n') ws = ws.slice(2);
      else if (ws.length > 0 && /^-\d+$/.test(ws[0].text)) ws = ws.slice(1);
      continue;
    }
    if (n0 === 'nohup' || n0 === 'time' || n0 === 'command' || n0 === 'exec' || n0 === 'builtin') {
      ws = ws.slice(1);
      while (ws.length > 0 && ws[0].text.startsWith('-')) ws = ws.slice(1);
      continue;
    }
    if (n0 === 'sudo') {
      ws = ws.slice(1);
      while (ws.length > 0 && ws[0].text.startsWith('-')) {
        ws = ['-u', '-g', '-h', '-p'].includes(ws[0].text) ? ws.slice(2) : ws.slice(1);
      }
      continue;
    }
    if (n0 === 'npx') {
      ws = ws.slice(1);
      while (ws.length > 0 && ws[0].text.startsWith('-')) {
        ws = ['-p', '--package'].includes(ws[0].text) ? ws.slice(2) : ws.slice(1);
      }
      continue;
    }
    if (n0 === 'yarn') {
      ws = [{ ...ws[0], text: 'pnpm' }, ...ws.slice(1)];
    }
    break;
  }
  handleCommand(ws, state, res, heredocs, depth);
}

function handleCommand(ws, state, res, heredocs, depth) {
  const name = path.posix.basename(ws[0].text);
  const rest = ws.slice(1);

  switch (name) {
    case 'cd':
    case 'pushd': {
      const pa = parseArgs(rest);
      const target = pa.positional[0];
      if (!target) {
        state.cwd = os.homedir().split(path.sep).join('/');
        state.unknown = false;
      } else if (target.dynamic || target.text === '-') {
        state.unknown = true;
      } else {
        const p = expandTilde(target);
        if (relUnusable(state, p)) return;
        state.cwd = resolveRel(state.cwd, p);
        if (path.posix.isAbsolute(p)) state.unknown = false;
      }
      return;
    }
    case 'popd':
      state.unknown = true;
      return;
    case 'eval':
      res.unanalyzable.push({ reason: 'eval は書込先を静的に特定できません' });
      return;
    case 'tee': {
      const pa = parseArgs(rest);
      for (const w of pa.positional) addWrite(state, w, res, 'tee');
      return;
    }
    case 'sed': {
      const pa = parseArgs(rest, ['-e', '-f', '--expression', '--file']);
      const inPlace = pa.flags.some((f) => f === '--in-place' || f.startsWith('--in-place=') || (!f.startsWith('--') && /^-[A-Za-z]*i/.test(f)));
      if (!inPlace) return;
      const hasScript = pa.flags.some((f) => f === '-e' || f === '-f' || f.startsWith('--expression') || f.startsWith('--file'));
      const files = hasScript ? pa.positional : pa.positional.slice(1);
      for (const w of files) addWrite(state, w, res, 'sed -i');
      return;
    }
    case 'perl': {
      const pa = parseArgs(rest, ['-e', '-E', '-I']);
      const code = pa.opts['-e'] || pa.opts['-E'];
      if (code) checkWriteApi(code.text, res, 'perl -e');
      const inPlace = pa.flags.some((f) => !f.startsWith('--') && /^-[pnalwsxuc0-9]*i/.test(f));
      if (inPlace) {
        const files = code ? pa.positional : pa.positional.slice(1);
        for (const w of files) addWrite(state, w, res, 'perl -i');
      }
      if (!code && (pa.positional.length === 0 || pa.positional[0].text === '-')) {
        for (const body of heredocsToScripts(heredocs)) checkWriteApi(body, res, 'perl heredoc');
      }
      return;
    }
    case 'cp':
    case 'install':
    case 'ln':
    case 'rsync': {
      const pa = parseArgs(rest, ARG_FLAGS[name]);
      const tdir = pa.opts['-t'] || pa.opts['--target-directory'];
      if (name === 'install' && pa.flags.some((f) => f === '-d' || f === '--directory')) {
        for (const w of pa.positional) addWrite(state, w, res, name);
      } else if (tdir) {
        addWrite(state, tdir, res, name);
      } else if (pa.positional.length > 0) {
        addWrite(state, pa.positional[pa.positional.length - 1], res, name);
      }
      return;
    }
    case 'mv': {
      const pa = parseArgs(rest, ARG_FLAGS.mv);
      const tdir = pa.opts['-t'] || pa.opts['--target-directory'];
      for (const w of pa.positional) addWrite(state, w, res, 'mv');
      if (tdir) addWrite(state, tdir, res, 'mv');
      return;
    }
    case 'rm':
    case 'rmdir':
    case 'unlink':
    case 'touch':
    case 'mkdir':
    case 'truncate': {
      const pa = parseArgs(rest, ARG_FLAGS[name] || []);
      for (const w of pa.positional) addWrite(state, w, res, name);
      return;
    }
    case 'chmod':
    case 'chown': {
      const pa = parseArgs(rest);
      const hasRef = pa.flags.some((f) => f.startsWith('--reference'));
      const files = hasRef ? pa.positional : pa.positional.slice(1);
      for (const w of files) addWrite(state, w, res, name);
      return;
    }
    case 'dd': {
      for (const w of rest) {
        if (w.text.startsWith('of=')) addWrite(state, withValue(w, w.text.slice(3)), res, 'dd');
      }
      return;
    }
    case 'git':
      handleGit(rest, state, res);
      return;
    case 'gh':
      handleGh(rest, res);
      return;
    case 'prettier':
    case 'eslint':
    case 'oxlint':
      handleFormatter(name, rest, state, res);
      return;
    case 'gradlew':
    case 'gradle':
      handleGradle(rest, state, res);
      return;
    case 'pnpm':
      handlePnpm(rest, state, res, heredocs, depth);
      return;
    case 'npm':
      handleNpm(rest, res);
      return;
    case 'xargs': {
      let i = 0;
      while (i < rest.length && rest[i].text.startsWith('-')) {
        i += ['-I', '-n', '-P', '-L', '-s', '-d', '-E', '-a'].includes(rest[i].text) ? 2 : 1;
      }
      checkSubcommand(rest.slice(i), state, res, depth, 'xargs');
      return;
    }
    case 'find': {
      if (rest.some((w) => w.text === '-delete')) {
        res.unanalyzable.push({ reason: 'find -delete は書込先を静的に特定できません' });
      }
      for (let i = 0; i < rest.length; i++) {
        if (['-exec', '-execdir', '-ok', '-okdir'].includes(rest[i].text)) {
          let j = i + 1;
          while (j < rest.length && rest[j].text !== ';' && rest[j].text !== '+') j += 1;
          checkSubcommand(rest.slice(i + 1, j), state, res, depth, 'find -exec');
          i = j;
        }
      }
      return;
    }
    default:
      break;
  }

  if (SHELL_NAMES.has(name)) {
    const pa = parseArgs(rest);
    const hasC = pa.flags.some((f) => !f.startsWith('--') && /^-[a-z]*c[a-z]*$/.test(f));
    if (hasC) {
      if (pa.positional[0]) analyzeInto(pa.positional[0].text, { cwd: state.cwd, unknown: state.unknown }, res, depth + 1);
    } else if (pa.positional.length === 0) {
      for (const body of heredocsToScripts(heredocs)) {
        analyzeInto(body, { cwd: state.cwd, unknown: state.unknown }, res, depth + 1);
      }
    }
    return;
  }
  if (/^python[\d.]*$/.test(name) || name === 'node' || name === 'ruby') {
    const codeFlags = name === 'node' ? ['-e', '--eval', '-p', '--print'] : name === 'ruby' ? ['-e'] : ['-c'];
    const argFlags = [...codeFlags, '-m', '-W', '-X', '-r', '--require'];
    const pa = parseArgs(rest, argFlags);
    let code = null;
    for (const f of codeFlags) {
      if (pa.opts[f]) code = pa.opts[f];
    }
    if (code) {
      checkWriteApi(code.text, res, `${name} インライン実行`);
      return;
    }
    if (pa.flags.includes('-m')) return;
    if (pa.positional.length === 0 || pa.positional[0].text === '-') {
      for (const body of heredocsToScripts(heredocs)) checkWriteApi(body, res, `${name} heredoc`);
    }
  }
  // 上記のどれにも当たらないコマンドは書込なしとして返す（事後照合に委ねる）。
}

function handleGit(args, state, res) {
  const local = { ...state };
  let i = 0;
  while (i < args.length && args[i].text.startsWith('-')) {
    const t = args[i].text;
    if (t === '-C') {
      const d = args[i + 1];
      if (d) {
        if (d.dynamic) local.unknown = true;
        else local.cwd = resolveRel(local.cwd, expandTilde(d));
      }
      i += 2;
    } else if (['-c', '--git-dir', '--work-tree', '--namespace'].includes(t)) {
      i += 2;
    } else {
      i += 1;
    }
  }
  const sub = args[i] ? args[i].text : '';
  const sargs = args.slice(i + 1);
  const rules = COMMAND_RULES.git;

  if (rules.pathWriters.includes(sub)) {
    const pa = parseArgs(sargs);
    for (const w of pa.positional) addWrite(local, w, res, `git ${sub}`);
    return;
  }
  if (sub === 'restore') {
    const pa = parseArgs(sargs, ['-s', '--source']);
    const staged = pa.flags.includes('--staged') || pa.flags.includes('-S');
    const worktree = pa.flags.includes('--worktree') || pa.flags.includes('-W');
    if (staged && !worktree) return;
    for (const w of pa.positional) addWrite(local, w, res, 'git restore');
    return;
  }
  if (sub === 'checkout') {
    const idx = sargs.findIndex((w) => w.text === '--');
    if (idx >= 0) {
      for (const w of sargs.slice(idx + 1)) addWrite(local, w, res, 'git checkout --');
      return;
    }
    res.forbidden.push({ reason: 'git checkout <ブランチ> は作業ツリー全体を書き換える禁止コマンドです' });
    return;
  }
  if (sub === 'stash') {
    const sub2 = firstNonFlag(sargs);
    if (sub2 && rules.stashReadOnly.includes(sub2.text)) return;
    res.forbidden.push({ reason: 'git stash は禁止コマンドです（list・show を除く。並行作業や他ロールの変更を巻き込むため）' });
    return;
  }
  if (sub === 'branch') {
    if (isBranchReadOnly(sargs, rules)) return;
    res.forbidden.push({
      reason: 'git branch は禁止コマンドです（一覧・--list・--show-current を除く。ブランチの作成・削除・改名・設定はメインの担当）',
    });
    return;
  }
  if (sub === 'remote') {
    const sub2 = firstNonFlag(sargs);
    if (!sub2 || rules.remoteReadOnly.includes(sub2.text)) return;
    res.forbidden.push({ reason: 'git remote は禁止コマンドです（-v・show・get-url を除く。リモートの設定はメインの担当）' });
    return;
  }
  if (sub === 'config') {
    if (isConfigReadOnly(sargs, rules)) return;
    res.forbidden.push({ reason: 'git config は禁止コマンドです（--get・--list・-l を除く。設定の変更はメインの担当）' });
    return;
  }
  if (rules.forbidden.includes(sub)) {
    res.forbidden.push({
      reason: `git ${sub} は禁止コマンドです（作業ツリー・履歴・リモートを書き換える操作で、コミット・ブランチ・リモート設定・タグはメインの担当）`,
    });
  }
}

function flagName(t) {
  const eq = t.indexOf('=');
  return t.startsWith('--') && eq > 0 ? t.slice(0, eq) : t;
}

// git branch が読取りだけか。書換えフラグがあれば false。位置引数があるのは --list・--show-current のときだけ（パターン指定）。
function isBranchReadOnly(sargs, rules) {
  const pa = parseArgs(sargs, rules.branchValueFlags);
  const writes = pa.flags.some(
    (f) =>
      rules.branchWriteFlags.includes(flagName(f)) ||
      (!f.startsWith('--') && [...f.slice(1)].some((c) => rules.branchWriteShortChars.includes(c))),
  );
  if (writes) return false;
  if (pa.positional.length === 0) return true;
  return pa.flags.some((f) => rules.branchListFlags.includes(f));
}

// git config が読取りだけか。書込みフラグがあれば false。読取りフラグか get・list サブコマンドがあるときだけ true。
function isConfigReadOnly(sargs, rules) {
  const pa = parseArgs(sargs, ['-f', '--file', '--blob']);
  const names = pa.flags.map(flagName);
  if (names.some((n) => rules.configWriteFlags.includes(n))) return false;
  if (names.some((n) => rules.configReadFlags.includes(n))) return true;
  return Boolean(pa.positional[0]) && rules.configReadSubcommands.includes(pa.positional[0].text);
}

function handleGh(args, res) {
  const pa = parseArgs(args, ['-R', '--repo', '--hostname']);
  const words = pa.positional.map((w) => w.text);
  for (const seq of COMMAND_RULES.gh.forbidden) {
    if (seq.every((s, k) => words[k] === s)) {
      res.forbidden.push({ reason: `gh ${seq.join(' ')} は禁止コマンドです（PR のマージはメインの担当）` });
      return;
    }
  }
}

function handleFormatter(name, args, state, res) {
  const rule = COMMAND_RULES.formatters[name];
  const pa = parseArgs(args, ARG_FLAGS[name === 'prettier' ? 'prettier' : 'eslint']);
  const writes = pa.flags.some((f) => rule.writeFlags.includes(f) || rule.writeFlags.some((wf) => f.startsWith(wf + '=')));
  if (!writes) return;
  if (pa.positional.length === 0) {
    res.unanalyzable.push({ reason: `対象を指定しない ${name} の書込は書込先を静的に特定できません` });
    return;
  }
  for (const w of pa.positional) classifyTarget(state, w, res, name);
}

function handleGradle(args, state, res) {
  const rules = COMMAND_RULES.gradle;
  const pa = parseArgs(args, ARG_FLAGS.gradle);
  const local = { ...state };
  const dir = pa.opts['-p'] || pa.opts['--project-dir'];
  if (dir) {
    if (dir.dynamic) local.unknown = true;
    else local.cwd = resolveRel(local.cwd, expandTilde(dir));
  }
  const tasks = pa.positional.map((w) => w.text);
  const spotlessRe = new RegExp(rules.spotlessTaskPattern);
  if (tasks.some((t) => spotlessRe.test(t))) {
    const hookPrefix = `-P${rules.spotlessHookProperty}=`;
    const hook = args.find((w) => w.text.startsWith(hookPrefix));
    if (hook) {
      addWrite(local, withValue(hook, hook.text.slice(hookPrefix.length)), res, 'gradle spotlessApply');
    } else {
      for (const p of rules.spotlessImplied) addImplied(res, p, 'gradle spotlessApply');
    }
  }
  const lockFlag = pa.flags.some((f) => rules.lockFlags.some((lf) => f === lf || f.startsWith(lf + '=')));
  const lockTask = tasks.some((t) => rules.lockTasks.includes(t.replace(/^:/, '')));
  if (lockFlag || lockTask) {
    for (const p of rules.lockImplied) addImplied(res, p, 'gradle 依存ロック・wrapper');
  }
}

function applyScript(script, res, label, dirs) {
  const entry = COMMAND_RULES.pnpmScripts[script];
  if (!entry) return;
  for (const sub of entry.impliedIn || []) {
    for (const d of dirs) addImplied(res, `${d}/${sub}`, `${label} ${script}`);
  }
  for (const p of entry.writes || []) addFixedWrite(res, p, `${label} ${script}`);
}

function handlePnpm(args, state, res, heredocs, depth) {
  const local = { ...state };
  const selectors = [];
  let recursive = false;
  let i = 0;
  while (i < args.length && args[i].text.startsWith('-')) {
    const t = args[i].text;
    if (t === '-C' || t === '--dir') {
      const d = args[i + 1];
      if (d) {
        if (d.dynamic) local.unknown = true;
        else local.cwd = resolveRel(local.cwd, expandTilde(d));
      }
      i += 2;
    } else if (t.startsWith('--dir=')) {
      local.cwd = resolveRel(local.cwd, t.slice('--dir='.length));
      i += 1;
    } else if (t === '--filter' || t === '-F' || t === '--filter-prod') {
      const v = args[i + 1];
      if (v) selectors.push(v.dynamic ? '$unresolved' : v.text);
      i += 2;
    } else if (t.startsWith('--filter=') || t.startsWith('--filter-prod=')) {
      selectors.push(t.slice(t.indexOf('=') + 1));
      i += 1;
    } else if (t === '-r' || t === '--recursive') {
      recursive = true;
      i += 1;
    } else if (ARG_FLAGS.pnpm.includes(t)) {
      i += 2;
    } else {
      i += 1;
    }
  }
  const sub = args[i] ? args[i].text : '';
  if (!sub) return;
  let rest = args.slice(i + 1);
  if (sub === 'exec' || sub === 'dlx') {
    // --filter が1つのパッケージだけを指すときは、そのパッケージのディレクトリで実行される。
    if (selectors.length > 0) {
      const dirs = resolvePackageDirs(selectors);
      if (dirs.length === 1) local.cwd = dirs[0];
    }
    while (rest.length > 0 && rest[0].text.startsWith('-')) rest = rest.slice(1);
    analyzeCommand(rest, local, res, heredocs, depth);
    return;
  }
  if (COMMAND_RULES.packageManager.pnpmCommands.includes(sub)) {
    for (const p of COMMAND_RULES.packageManager.writes) addFixedWrite(res, p, `pnpm ${sub}`);
    return;
  }
  const dirs = resolveScriptDirs(local, selectors, recursive);
  if (sub === 'run' || sub === 'run-script') {
    const s = firstNonFlag(rest);
    if (s) applyScript(s.text, res, 'pnpm', dirs);
    return;
  }
  applyScript(sub, res, 'pnpm', dirs);
}

function handleNpm(args, res) {
  const sub = firstNonFlag(args);
  if (!sub) return;
  if (COMMAND_RULES.packageManager.npmCommands.includes(sub.text)) {
    for (const p of COMMAND_RULES.packageManager.writes) addFixedWrite(res, p, `npm ${sub.text}`);
    return;
  }
  if (sub.text === 'run' || sub.text === 'run-script') {
    const idx = args.indexOf(sub);
    const s = firstNonFlag(args.slice(idx + 1));
    if (s) applyScript(s.text, res, 'npm', allPackageDirs());
  }
}

function analyzeSegment(seg, state, res, depth) {
  for (const r of seg.redirs) {
    if (r.op === '>' || r.op === '>>') addWrite(state, r.target, res, r.op);
  }
  if (seg.words.length === 0) return;
  const heredocs = seg.redirs.filter((r) => r.op === 'heredoc').map((r) => r.obj);
  analyzeCommand(seg.words, state, res, heredocs, depth);
}

function analyzeInto(text, ctx, res, depth) {
  if (depth > 5) {
    res.unanalyzable.push({ reason: '解析の入れ子が深すぎます' });
    return;
  }
  const { items, unterminated } = lex(text);
  if (unterminated) res.unanalyzable.push({ reason: 'クォートが閉じていません' });
  const events = buildEvents(items);
  const stack = [];
  let state = { cwd: ctx.cwd || '', unknown: Boolean(ctx.unknown) };
  for (const ev of events) {
    if (ev.kind === 'open') {
      stack.push({ ...state });
    } else if (ev.kind === 'close') {
      if (stack.length > 0) state = stack.pop();
    } else {
      analyzeSegment(ev, state, res, depth);
    }
  }
}

/**
 * Bash コマンド文字列から書込先・暗黙の書込先・禁止操作・解析不能な書込を抽出する。
 * path・prefix は root 相対（cwdRel と静的な cd を反映済み）。root 外は .. で始まるか絶対パスのまま返し、判定は呼出し側が行う。
 * @param {string} command
 * @param {{cwdRel?: string}} [opts]
 * @returns {{writes: {path: string, via: string}[], implied: {prefix: string, via: string}[], unanalyzable: {reason: string}[], forbidden: {reason: string}[]}}
 */
export function analyzeBashCommand(command, { cwdRel = '' } = {}) {
  const res = { writes: [], implied: [], unanalyzable: [], forbidden: [] };
  if (typeof command !== 'string') {
    res.unanalyzable.push({ reason: 'コマンドが文字列ではありません' });
    return res;
  }
  analyzeInto(command, { cwd: cwdRel, unknown: false }, res, 0);
  return res;
}

// ---------------------------------------------------------------------------
// 暗黙の書込先の被覆判定
// ---------------------------------------------------------------------------

function staticPrefix(glob) {
  const idx = glob.search(/[*?[{]/);
  return idx < 0 ? glob : glob.slice(0, idx);
}

/**
 * ディレクトリ接頭辞が許可 glob にどれだけ含まれるかを返す。
 * full: 「ディレクトリ配下すべて」を意味する glob で prefix が丸ごと含まれる。
 * partial: いずれかの glob の静的接頭辞と prefix が包含関係にある。
 * none: どれにも当たらない。
 * @param {string} prefix
 * @param {string[]} globs
 * @returns {'full'|'partial'|'none'}
 */
export function impliedCoverage(prefix, globs) {
  let partial = false;
  for (const g of globs || []) {
    const sp = staticPrefix(g);
    if (g.endsWith('/**') && sp === g.slice(0, -2) && prefix.startsWith(sp)) return 'full';
    if (sp.startsWith(prefix) || prefix.startsWith(sp)) partial = true;
  }
  return partial ? 'partial' : 'none';
}

// ---------------------------------------------------------------------------
// git 差分スナップショット
// ---------------------------------------------------------------------------

/**
 * git status の対象パスと内容ハッシュのスナップショットを取る。gitignore 済みのパスは対象外。
 * @returns {{ok: true, entries: Object<string, string>} | {ok: false, error: string}}
 */
export function takeSnapshot(root, { spawnSync = nodeSpawnSync, readFileSync = fs.readFileSync } = {}) {
  try {
    const r = spawnSync('git', ['-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (r.error) return { ok: false, error: `git を実行できません: ${r.error.message}` };
    if (r.status !== 0) return { ok: false, error: `git status が失敗しました（終了コード ${r.status}）` };
    const tokens = String(r.stdout).split('\0');
    const paths = [];
    for (let k = 0; k < tokens.length; k++) {
      const tok = tokens[k];
      if (!tok) continue;
      const xy = tok.slice(0, 2);
      paths.push(tok.slice(3));
      if (xy.includes('R') || xy.includes('C')) {
        k += 1;
        if (tokens[k]) paths.push(tokens[k]);
      }
    }
    const entries = {};
    for (const p of paths) {
      try {
        const buf = readFileSync(path.join(root, p));
        entries[p] = crypto.createHash('sha1').update(buf).digest('hex');
      } catch {
        entries[p] = 'absent';
      }
    }
    return { ok: true, entries };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 2つのスナップショットを比べ、変化したパス（追加・変更・削除）をソートして返す。純関数。
 * スナップショット（{ok, entries}）でも entries だけのオブジェクトでも受け取る。
 * @returns {string[]}
 */
export function diffSnapshots(before, after) {
  const b = (before && before.entries) || before || {};
  const a = (after && after.entries) || after || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed = [];
  for (const k of keys) {
    if (b[k] !== a[k]) changed.push(k);
  }
  return changed.sort();
}

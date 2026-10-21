import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  appendNote,
  appendRow,
  applyTransition,
  artifactMatcher,
  buildGateCells,
  checkRowState,
  classifyStatus,
  commentMask,
  escapeCell,
  extractHash,
  HandoffError,
  joinCells,
  matchSpecDir,
  normalizeTasks,
  parseArgs,
  parseRecord,
  parseTransitions,
  readGateRow,
  setGate,
  setKey,
  splitCells,
} from './handoff.mjs';

const SCRIPT = fileURLToPath(new URL('./handoff.mjs', import.meta.url));

// 実物の handoff.md と同じ形の見本（現在地のコメントに定型の表、各表、コメント）。
const HANDOFF = `# handoff: 001-demo
<!-- 書き手はメイン。 -->

## 現在地
- 区間: A
- 次に起動するコマンド: \`/tsod-spec 001-demo\`
- 推奨モデル: Opus
- ブランチ: \`feat/001-demo\`
<!--
区間の終わりの定型

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | \`/tsod-spec 001-demo\` | Opus | \`feat/001-demo\` |
| A→B | B | \`/tsod-screen-table 001-demo\` | Opus | \`feat/001-demo\`（不変） |
| A→C（UI もテーブル変更も無い） | C | \`/tsod-plan 001-demo\` | Opus | \`feat/001-demo\`（不変） |
| C→D | D | \`/tsod-build 001-demo\` | Sonnet | \`feat/001-demo\`（不変） |
| E→完了 | 完了 | なし | なし | なし |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 未 | |
| A-2 | 薄仕様 spec.md | 未 | |
| B-1 | 画面設計 screen-design.md | 未 | |
| B-2 | テーブル設計（design/・migration） | 未 | |
| C-1 | plan.md・tasks.md | 未 | |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。 -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
<!-- 区間 D。 -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
<!-- 区間 D。 -->

## 区間メモ
<!-- 次の区間が知るべき事実だけ -->
`;

function sh(cwd, cmd, ...args) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')} が失敗: ${r.stderr}`);
  return r.stdout.trim();
}

const git = (cwd, ...args) => sh(cwd, 'git', '-c', 'commit.gpgsign=false', ...args);

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

function write(dir, rel, content) {
  const abs = path.join(dir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const read = (dir, rel) => readFileSync(path.join(dir, rel), 'utf8');

/** 一時ディレクトリに git リポジトリと specs/001-demo を作る。 */
function makeRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'handoff-test-'));
  git(dir, 'init', '-q');
  write(dir, 'specs/001-demo/handoff.md', HANDOFF);
  write(dir, 'specs/001-demo/spec.md', '# spec\n');
  write(dir, 'specs/001-demo/plan.md', '# plan\n');
  write(dir, 'specs/001-demo/tasks.md', '# tasks\n- [ ] T1\n- [ ] T2\n');
  write(dir, 'README.md', 'readme\n');
  return dir;
}

function commitAll(dir, message) {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
  return git(dir, 'rev-parse', '--short=7', 'HEAD');
}

function withRepo(fn) {
  const dir = makeRepo();
  try {
    commitAll(dir, 'init');
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HANDOFF_PATH = 'specs/001-demo/handoff.md';

/** 変わった行の数（行数が同じ前提）。 */
function changedLineCount(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  assert.equal(a.length, b.length);
  return a.filter((line, i) => line !== b[i]).length;
}

// ---- 純関数 ----

test('extractHash: 先頭の7〜40桁の16進を取り、後ろが語の続きなら取らない', () => {
  assert.equal(extractHash('81447bd'), '81447bd');
  assert.equal(extractHash('81447bd（移設先: Q4）'), '81447bd');
  assert.equal(extractHash('PR 17'), null);
  assert.equal(extractHash('abc123'), null);
  assert.equal(extractHash('abcdef1xyz'), null);
});

test('parseRecord: 日付とハッシュを分ける', () => {
  assert.deepEqual(parseRecord('2026-10-06 / 81447bd（移設先: Q4）'), { date: '2026-10-06', rest: '81447bd（移設先: Q4）', hash: '81447bd' });
  assert.deepEqual(parseRecord('2026-10-07 / PR 17'), { date: '2026-10-07', rest: 'PR 17', hash: null });
  assert.equal(parseRecord('').hash, null);
});

test('classifyStatus: 承認済み・該当なし・それ以外', () => {
  assert.equal(classifyStatus('承認済み'), 'approved');
  assert.equal(classifyStatus('承認済み（手動マージ）'), 'approved');
  assert.equal(classifyStatus('該当なし（テーブル変更なし）'), 'na');
  assert.equal(classifyStatus('未'), 'pending');
  assert.equal(classifyStatus(''), 'pending');
});

test('splitCells / joinCells: 空のセルと \\| を扱う', () => {
  assert.deepEqual(splitCells('| A-1 | 対象 | 未 | |'), ['A-1', '対象', '未', '']);
  assert.deepEqual(splitCells('| a \\| b | c |'), ['a \\| b', 'c']);
  assert.equal(joinCells(['A-1', '対象', '未', '']), '| A-1 | 対象 | 未 | |');
  assert.equal(escapeCell('a|b\nc'), 'a\\|b c');
});

test('commentMask: コメントの中の行だけ true', () => {
  assert.deepEqual(commentMask(['a', '<!-- x', '| t |', '-->', 'b', '<!-- one -->', 'c']), [false, true, true, true, false, true, false]);
});

test('normalizeTasks: チェックボックスの状態を揃える', () => {
  assert.equal(normalizeTasks('- [x] T1\n- [X] T2\n- [ ] T3\n'), '- [ ] T1\n- [ ] T2\n- [ ] T3\n');
  assert.notEqual(normalizeTasks('- [x] T1 変更\n'), normalizeTasks('- [x] T1\n'));
});

test('matchSpecDir: 番号で1つに決まる', () => {
  const names = ['001-a', '002-b', '010-c'];
  assert.equal(matchSpecDir(names, '002'), '002-b');
  assert.equal(matchSpecDir(names, '010-c'), '010-c');
  assert.throws(() => matchSpecDir(names, '003'), HandoffError);
  assert.throws(() => matchSpecDir(['001-a', '001-b'], '001'), HandoffError);
});

test('artifactMatcher: ゲートごとの成果物', () => {
  const dir = 'specs/001-demo';
  assert.equal(artifactMatcher('A-1', dir)('specs/001-demo/decisions.md'), true);
  assert.equal(artifactMatcher('A-2', dir)('specs/001-demo/spec.md'), true);
  assert.equal(artifactMatcher('A-2', dir)('specs/001-demo/plan.md'), false);
  assert.equal(artifactMatcher('B-1', dir)('specs/001-demo/screen-design.md'), true);
  assert.equal(artifactMatcher('B-2', dir)('db/migration/V1__x.sql'), true);
  assert.equal(artifactMatcher('B-2', dir)('design/attributes.yaml'), true);
  assert.equal(artifactMatcher('C-1', dir)('specs/001-demo/tasks.md'), true);
  assert.equal(artifactMatcher('D-1', dir)('apps/web/src/main/a.ts'), true);
  assert.equal(artifactMatcher('D-1', dir)('specs/001-demo/handoff.md'), false);
  assert.equal(artifactMatcher('E-1', dir), null);
});

test('checkRowState: 未承認・ハッシュ無しは不一致、該当なしと E-1 は通る', () => {
  const dir = 'specs/001-demo';
  assert.equal(checkRowState('A-2', { status: '未', record: '' }, dir).ok, false);
  assert.equal(checkRowState('A-2', { status: '承認済み', record: '2026-10-06 / PR 1' }, dir).ok, false);
  assert.deepEqual(checkRowState('A-2', { status: '承認済み', record: '2026-10-06 / c7d2bea' }, dir), { ok: true, hash: 'c7d2bea' });
  assert.equal(checkRowState('B-2', { status: '該当なし（変更なし）', record: '2026-10-06' }, dir).ok, true);
  assert.equal(checkRowState('E-1', { status: '承認済み', record: '2026-10-07 / PR 17' }, dir).ok, true);
});

test('buildGateCells: 承認済みと該当なし', () => {
  assert.deepEqual(buildGateCells({ record: 'abc1234', na: null }, '2026-10-21'), { status: '承認済み', record: '2026-10-21 / abc1234' });
  assert.deepEqual(buildGateCells({ record: null, na: '変更なし' }, '2026-10-21'), { status: '該当なし（変更なし）', record: '2026-10-21' });
});

test('parseArgs: 正しい形', () => {
  assert.deepEqual(parseArgs(['gate', '001', 'A-2', 'abc1234']), { cmd: 'gate', nnn: '001', gate: 'A-2', record: 'abc1234', na: null });
  assert.deepEqual(parseArgs(['gate', '001', 'B-2', '--na', '変更なし']), { cmd: 'gate', nnn: '001', gate: 'B-2', record: null, na: '変更なし' });
  assert.deepEqual(parseArgs(['check', '001-demo', 'A-2', 'B-1']), { cmd: 'check', nnn: '001-demo', gates: ['A-2', 'B-1'] });
  assert.deepEqual(parseArgs(['row', '001', '委譲の記録', 'a', 'b', 'c']).cells, ['a', 'b', 'c']);
});

test('parseArgs: 引数誤りは HandoffError', () => {
  assert.throws(() => parseArgs([]), HandoffError);
  assert.throws(() => parseArgs(['bogus', '001']), HandoffError);
  assert.throws(() => parseArgs(['gate']), HandoffError);
  assert.throws(() => parseArgs(['gate', 'x', 'A-2', 'abc1234']), HandoffError);
  assert.throws(() => parseArgs(['gate', '001', 'Z-9', 'abc1234']), HandoffError);
  assert.throws(() => parseArgs(['gate', '001', 'A-2']), HandoffError);
  assert.throws(() => parseArgs(['check', '001']), HandoffError);
  assert.throws(() => parseArgs(['set', '001', '現在地', '区間']), HandoffError);
  assert.throws(() => parseArgs(['note', '001', '区間メモ']), HandoffError);
  assert.throws(() => parseArgs(['check', '001', 'A-2', '--na', 'x']), HandoffError);
  assert.throws(() => parseArgs(['check', '001', 'A-2', '--bogus']), HandoffError);
});

test('setKey: 該当の行だけを書き換え、コメントの中は触らない', () => {
  const out = setKey(HANDOFF, '現在地', '区間', 'B');
  assert.equal(changedLineCount(HANDOFF, out), 1);
  assert.match(out, /^- 区間: B$/m);
  assert.throws(() => setKey(HANDOFF, '現在地', '無いキー', 'x'), HandoffError);
  assert.throws(() => setKey(HANDOFF, '無い節', '区間', 'x'), HandoffError);
});

test('setGate / readGateRow: 該当の行だけを書き換える', () => {
  const out = setGate(HANDOFF, 'A-2', '承認済み', '2026-10-06 / c7d2bea');
  assert.equal(changedLineCount(HANDOFF, out), 1);
  assert.deepEqual(readGateRow(out, 'A-2'), { gate: 'A-2', target: '薄仕様 spec.md', status: '承認済み', record: '2026-10-06 / c7d2bea' });
  assert.equal(readGateRow(out, 'A-1').status, '未');
  assert.throws(() => setGate(HANDOFF, 'Z-9', 'x', 'y'), HandoffError);
});

test('parseTransitions / applyTransition: 定型の行で現在地の4行を書く', () => {
  assert.equal(parseTransitions(HANDOFF).length, 5);
  const out = applyTransition(HANDOFF, 'A→B');
  // 推奨モデルは Opus のままなので、変わるのは区間・コマンド・ブランチの3行
  assert.equal(changedLineCount(HANDOFF, out), 3);
  assert.match(out, /^- 区間: B$/m);
  assert.match(out, /^- 次に起動するコマンド: `\/tsod-screen-table 001-demo`$/m);
  assert.match(out, /^- ブランチ: `feat\/001-demo`（不変）$/m);
  assert.match(applyTransition(HANDOFF, 'A→C'), /^- 区間: C$/m);
  assert.match(applyTransition(HANDOFF, 'E→完了'), /^- 次に起動するコマンド: なし$/m);
  assert.throws(() => applyTransition(HANDOFF, 'X→Y'), HandoffError);
});

test('appendRow: 表の最後の行の後ろに1行足し、列数違いは HandoffError', () => {
  const out = appendRow(HANDOFF, '委譲の記録', ['api 実装', 'api-agent', 'abc1234']);
  assert.equal(out.split('\n').length, HANDOFF.split('\n').length + 1);
  assert.match(out, /^\| api 実装 \| api-agent \| abc1234 \|\n<!-- 区間 D。 -->$/m);
  assert.throws(() => appendRow(HANDOFF, '委譲の記録', ['a', 'b']), HandoffError);
  assert.throws(() => appendRow(HANDOFF, '現在地', ['a']), HandoffError);
});

test('appendNote: コメントだけの節にも、内容のある節にも足せる', () => {
  const once = appendNote(HANDOFF, '区間メモ', '一件目');
  assert.match(once, /<!-- 次の区間が知るべき事実だけ -->\n- 一件目\n/);
  const twice = appendNote(once, '区間メモ', '- 二件目');
  assert.match(twice, /- 一件目\n- 二件目\n/);
});

// ---- CLI（一時ディレクトリの git リポジトリ）----

test('gate: 該当の行だけを承認済み・日付・記録にする', () => {
  withRepo((dir) => {
    const hash = git(dir, 'rev-parse', '--short=7', 'HEAD');
    const before = read(dir, HANDOFF_PATH);
    const r = run(dir, 'gate', '001', 'A-2', `${hash}（メモ）`);
    assert.equal(r.status, 0, r.err);
    const after = read(dir, HANDOFF_PATH);
    assert.equal(changedLineCount(before, after), 1);
    const row = readGateRow(after, 'A-2');
    assert.equal(row.status, '承認済み');
    assert.match(row.record, new RegExp(`^\\d{4}-\\d{2}-\\d{2} / ${hash}（メモ）$`));
  });
});

test('gate: 記録のハッシュが実在しないと exit 1 でファイルは変わらない', () => {
  withRepo((dir) => {
    const before = read(dir, HANDOFF_PATH);
    const r = run(dir, 'gate', '001', 'A-2', 'deadbee');
    assert.equal(r.status, 1);
    assert.equal(read(dir, HANDOFF_PATH), before);
  });
});

test('gate: --na で該当なし、ハッシュでない記録（PR 番号）も書ける', () => {
  withRepo((dir) => {
    assert.equal(run(dir, 'gate', '001', 'B-2', '--na', 'テーブル変更なし').status, 0);
    assert.equal(run(dir, 'gate', '001', 'E-1', 'PR 17').status, 0);
    const text = read(dir, HANDOFF_PATH);
    assert.equal(readGateRow(text, 'B-2').status, '該当なし（テーブル変更なし）');
    assert.match(readGateRow(text, 'E-1').record, /^\d{4}-\d{2}-\d{2} \/ PR 17$/);
  });
});

test('check: 未承認は exit 1', () => {
  withRepo((dir) => {
    const r = run(dir, 'check', '001', 'A-2');
    assert.equal(r.status, 1);
    assert.match(r.out, /NG A-2: 未承認/);
  });
});

test('check: 承認済みでハッシュの後に変更が無ければ exit 0、複数のゲートをまとめて見る', () => {
  withRepo((dir) => {
    const hash = git(dir, 'rev-parse', '--short=7', 'HEAD');
    assert.equal(run(dir, 'gate', '001', 'A-2', hash).status, 0);
    assert.equal(run(dir, 'gate', '001', 'B-2', '--na', '変更なし').status, 0);
    const r = run(dir, 'check', '001', 'A-2', 'B-2');
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /OK A-2/);
    assert.match(r.out, /OK B-2/);
  });
});

test('check: 記録したハッシュが履歴に無いと exit 1', () => {
  withRepo((dir) => {
    const p = path.join(dir, HANDOFF_PATH);
    writeFileSync(p, setGate(read(dir, HANDOFF_PATH), 'A-2', '承認済み', '2026-10-06 / deadbee'));
    const r = run(dir, 'check', '001', 'A-2');
    assert.equal(r.status, 1);
    assert.match(r.out, /NG A-2: .*deadbee/);
  });
});

test('check: 別のブランチだけにあるハッシュ（HEAD の履歴に無い）は exit 1', () => {
  withRepo((dir) => {
    git(dir, 'checkout', '-q', '-b', 'other');
    write(dir, 'other.txt', 'x\n');
    const other = commitAll(dir, 'other');
    git(dir, 'checkout', '-q', '-');
    writeFileSync(path.join(dir, HANDOFF_PATH), setGate(read(dir, HANDOFF_PATH), 'A-2', '承認済み', `2026-10-06 / ${other}`));
    const r = run(dir, 'check', '001', 'A-2');
    assert.equal(r.status, 1);
    assert.match(r.out, /履歴に無い/);
  });
});

test('check: ハッシュの後に成果物が変わると exit 1（コミット済み・作業ツリーのどちらも）', () => {
  withRepo((dir) => {
    const hash = git(dir, 'rev-parse', '--short=7', 'HEAD');
    assert.equal(run(dir, 'gate', '001', 'A-2', hash).status, 0);
    // 成果物でないファイルの変更は通る
    write(dir, 'README.md', 'changed\n');
    commitAll(dir, 'unrelated');
    assert.equal(run(dir, 'check', '001', 'A-2').status, 0);
    // 作業ツリーだけの変更
    write(dir, 'specs/001-demo/spec.md', '# spec 改\n');
    const dirty = run(dir, 'check', '001', 'A-2');
    assert.equal(dirty.status, 1);
    assert.match(dirty.out, /spec\.md/);
    // コミット済みの変更
    commitAll(dir, 'spec 改');
    assert.equal(run(dir, 'check', '001', 'A-2').status, 1);
  });
});

test('check: C-1 は tasks.md のチェックボックスだけの変更なら通り、本文の変更では exit 1', () => {
  withRepo((dir) => {
    const hash = git(dir, 'rev-parse', '--short=7', 'HEAD');
    assert.equal(run(dir, 'gate', '001', 'C-1', hash).status, 0);
    write(dir, 'specs/001-demo/tasks.md', '# tasks\n- [x] T1\n- [x] T2\n');
    assert.equal(run(dir, 'check', '001', 'C-1').status, 0);
    commitAll(dir, 'チェックボックス');
    assert.equal(run(dir, 'check', '001', 'C-1').status, 0);
    write(dir, 'specs/001-demo/tasks.md', '# tasks\n- [x] T1\n- [x] T2\n- [ ] T3\n');
    const r = run(dir, 'check', '001', 'C-1');
    assert.equal(r.status, 1);
    assert.match(r.out, /tasks\.md/);
  });
});

test('check: D-1 は handoff.md 以外の変更で exit 1、handoff.md だけの変更なら通る', () => {
  withRepo((dir) => {
    const hash = git(dir, 'rev-parse', '--short=7', 'HEAD');
    assert.equal(run(dir, 'gate', '001', 'D-1', hash).status, 0);
    assert.equal(run(dir, 'check', '001', 'D-1').status, 0);
    write(dir, 'apps/api/A.java', 'class A {}\n');
    assert.equal(run(dir, 'check', '001', 'D-1').status, 1);
  });
});

test('check: 複数のゲートの1つでも不一致なら exit 1 で、不一致のゲートを出す', () => {
  withRepo((dir) => {
    const hash = git(dir, 'rev-parse', '--short=7', 'HEAD');
    assert.equal(run(dir, 'gate', '001', 'A-2', hash).status, 0);
    const r = run(dir, 'check', '001', 'A-2', 'B-1');
    assert.equal(r.status, 1);
    assert.match(r.out, /OK A-2/);
    assert.match(r.out, /NG B-1: 未承認/);
  });
});

test('set / transition / row / note: 該当の箇所だけを書き換える', () => {
  withRepo((dir) => {
    let before = read(dir, HANDOFF_PATH);
    assert.equal(run(dir, 'set', '001', '現在地', '推奨モデル', 'Sonnet').status, 0);
    let after = read(dir, HANDOFF_PATH);
    assert.equal(changedLineCount(before, after), 1);
    assert.match(after, /^- 推奨モデル: Sonnet$/m);

    before = after;
    assert.equal(run(dir, 'transition', '001', 'C→D').status, 0);
    after = read(dir, HANDOFF_PATH);
    // 推奨モデルは直前の set で Sonnet にしてあり、C→D も Sonnet なので3行
    assert.equal(changedLineCount(before, after), 3);
    assert.match(after, /^- 区間: D$/m);
    assert.match(after, /^- 推奨モデル: Sonnet$/m);

    before = after;
    assert.equal(run(dir, 'row', '001', '委譲の記録', 'web 実装', 'web-agent', 'abc1234').status, 0);
    after = read(dir, HANDOFF_PATH);
    assert.equal(after.split('\n').length, before.split('\n').length + 1);
    assert.match(after, /^\| web 実装 \| web-agent \| abc1234 \|$/m);

    before = after;
    assert.equal(run(dir, 'note', '001', '区間メモ', '再開位置は T3').status, 0);
    after = read(dir, HANDOFF_PATH);
    assert.equal(after.split('\n').length, before.split('\n').length + 1);
    assert.match(after, /^- 再開位置は T3$/m);
  });
});

test('row: 列数違いは exit 2 でファイルは変わらない', () => {
  withRepo((dir) => {
    const before = read(dir, HANDOFF_PATH);
    const r = run(dir, 'row', '001', 'レビュー記録', '1', 'a..b', '要約');
    assert.equal(r.status, 2);
    assert.equal(read(dir, HANDOFF_PATH), before);
  });
});

test('引数誤り・対象が無いときは exit 2', () => {
  withRepo((dir) => {
    assert.equal(run(dir).status, 2);
    assert.equal(run(dir, 'bogus', '001').status, 2);
    assert.equal(run(dir, 'gate', '001', 'Z-9', 'abc1234').status, 2);
    assert.equal(run(dir, 'gate', '001', 'A-2').status, 2);
    assert.equal(run(dir, 'check', '001').status, 2);
    assert.equal(run(dir, 'check', '099', 'A-2').status, 2);
    assert.equal(run(dir, 'set', '001', '無い節', '区間', 'x').status, 2);
    assert.equal(run(dir, 'transition', '001', 'X→Y').status, 2);
  });
});

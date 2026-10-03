// lessons-ledger.mjs の回帰テスト（node --test）。
// fixture は一時ディレクトリ（<tmp>/tasks/lessons.md）に作り、実 tasks/ には触れない。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  parseLedger,
  compareLedger,
  applyReflection,
  planAction,
  formatDiff,
  runCli,
} from './lessons-ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'lessons-ledger.mjs');
const REFLECTION_PATH = path.join(HERE, '..', 'reflection.json');
const SNAPSHOT_PATH = path.join(HERE, '..', 'ledger-snapshot.txt');

const PREAMBLE = '# 教訓台帳\n\n案内の文。\n\n';
const A = '## 見出しA\n- 種別: 規律昇華\n- 提案: a\n\n';
const B = '## 見出しB\n- 種別: 矛盾是正\n- 提案: b\n\n';
const C = '## 見出しC\n- 種別: 規律昇華\n- 提案: c\n';
const LEDGER = A + B + C;
const HA = '## 見出しA';
const HB = '## 見出しB';
const HC = '## 見出しC';

function makeRoot(ledgerText) {
  const root = mkdtempSync(path.join(tmpdir(), 'lessons-ledger-test-'));
  if (ledgerText !== null) {
    mkdirSync(path.join(root, 'tasks'));
    writeFileSync(path.join(root, 'tasks', 'lessons.md'), ledgerText);
  }
  return root;
}

function ledgerPathOf(root) {
  return path.join(root, 'tasks', 'lessons.md');
}

function capture() {
  const lines = [];
  return { lines, stdout: (s) => lines.push(s), stderr: (s) => lines.push(s) };
}

function writeData(dir, entries, snapshot) {
  const reflectionPath = path.join(dir, 'reflection.json');
  const snapshotPath = path.join(dir, 'snapshot.txt');
  writeFileSync(reflectionPath, JSON.stringify({ entries: entries.map((heading) => ({ heading })) }));
  writeFileSync(snapshotPath, snapshot);
  return { reflectionPath, snapshotPath };
}

const realReflection = JSON.parse(readFileSync(REFLECTION_PATH, 'utf8'));
const realSnapshot = readFileSync(SNAPSHOT_PATH, 'utf8');

test('parseLedger: 結合すると元の text に戻る', () => {
  for (const text of [LEDGER, 'preamble\n\n' + LEDGER, '', 'だけ前置き\n', realSnapshot]) {
    const p = parseLedger(text);
    assert.equal(p.preamble + p.entries.map((e) => e.text).join(''), text);
  }
});

test('parseLedger: 見出し行そのものを heading にする', () => {
  const p = parseLedger('前置き\n' + LEDGER);
  assert.equal(p.preamble, '前置き\n');
  assert.deepEqual(p.entries.map((e) => e.heading), [HA, HB, HC]);
  assert.equal(p.entries[0].text, A);
});

test('compareLedger: 一致', () => {
  const r = compareLedger(LEDGER, LEDGER);
  assert.equal(r.equal, true);
  assert.equal(r.appendOnly, false);
  assert.deepEqual([r.added, r.removed, r.changed], [[], [], []]);
});

test('compareLedger: 末尾への追記は appendOnly', () => {
  const r = compareLedger(LEDGER + '\n## 新規D\n- 種別: x\n', LEDGER);
  assert.equal(r.equal, false);
  assert.equal(r.appendOnly, true);
  assert.deepEqual(r.added, ['## 新規D']);
});

test('compareLedger: 途中の変更・削除は appendOnly でない', () => {
  const changed = compareLedger(LEDGER.replace('- 提案: b', '- 提案: b2') + '\n## 新規D\n', LEDGER);
  assert.deepEqual(changed.changed, [HB]);
  assert.equal(changed.appendOnly, false);
  const removed = compareLedger(A + C + '\n## 新規D\n', LEDGER);
  assert.deepEqual(removed.removed, [HB]);
  assert.equal(removed.appendOnly, false);
});

test('compareLedger: 純粋な末尾追記（最終項目の末尾空白差を含む）は changed が空', () => {
  const r = compareLedger(LEDGER.trimEnd() + '\n\n## 新規D\n- 種別: x\n', LEDGER);
  assert.deepEqual(r.changed, []);
  assert.deepEqual(r.added, ['## 新規D']);
  assert.equal(r.appendOnly, true);
});

test('applyReflection: 一部削除は他の項目を逐語で残す', () => {
  assert.equal(applyReflection('前置き\n' + LEDGER, [HB]), '前置き\n' + A + C);
  assert.equal(applyReflection(LEDGER, [HA, HC]), B);
});

test('applyReflection: 全削除は空文字列', () => {
  assert.equal(applyReflection(LEDGER, [HA, HB, HC]), '');
});

test('applyReflection: 反映済みが0件なら何も消さない', () => {
  assert.equal(applyReflection(PREAMBLE + LEDGER, []), PREAMBLE + LEDGER);
});

test('planAction: unapplied', () => {
  const r = planAction({ current: LEDGER, snapshot: LEDGER, reflectedHeadings: [HA] });
  assert.equal(r.kind, 'unapplied');
  assert.equal(r.next, B + C);
});

test('planAction: applied（一部反映・全件反映でファイル無し）', () => {
  assert.equal(planAction({ current: B + C, snapshot: LEDGER, reflectedHeadings: [HA] }).kind, 'applied');
  assert.equal(planAction({ current: null, snapshot: LEDGER, reflectedHeadings: [HA, HB, HC] }).kind, 'applied');
});

test('planAction: ファイル無しで未反映の項目が残るはずなら mismatch', () => {
  assert.equal(planAction({ current: null, snapshot: LEDGER, reflectedHeadings: [HA] }).kind, 'mismatch');
});

test('planAction: mismatch', () => {
  const r = planAction({ current: LEDGER + '\n## 新規D\n', snapshot: LEDGER, reflectedHeadings: [HA] });
  assert.equal(r.kind, 'mismatch');
  assert.equal(r.next, null);
  assert.deepEqual(r.diff.added, ['## 新規D']);
});

test('planAction: invalid（反映済み見出しがスナップショットに無い）', () => {
  const r = planAction({ current: LEDGER, snapshot: LEDGER, reflectedHeadings: ['## 無い見出し'] });
  assert.equal(r.kind, 'invalid');
});

test('planAction: acceptAdditions は追記分を残した next を返す', () => {
  const extra = '\n## 新規D\n- 種別: x\n';
  const r = planAction({ current: LEDGER + extra, snapshot: LEDGER, reflectedHeadings: [HA, HB, HC], acceptAdditions: true });
  assert.equal(r.kind, 'mismatch');
  assert.equal(r.next, '## 新規D\n- 種別: x\n');
  // 追記でなく変更があるときは受け入れない
  const bad = planAction({ current: LEDGER.replace('- 提案: b', '- 提案: X') + extra, snapshot: LEDGER, reflectedHeadings: [HA], acceptAdditions: true });
  assert.equal(bad.next, null);
});

test('formatDiff: 追記・消失・変更の見出しを列挙する', () => {
  const s = formatDiff({ added: ['## 追'], removed: ['## 消'], changed: ['## 変'] });
  assert.match(s, /## 追/);
  assert.match(s, /## 消/);
  assert.match(s, /## 変/);
  assert.equal(formatDiff({ added: [], removed: [], changed: [] }), '差分なし');
});

// --- CLI（fixture の reflection / snapshot を注入して検査する） ---

function fixtureIo(dir) {
  return writeData(dir, [HA, HB, HC], LEDGER);
}

test('CLI check: 一致は0・不一致は1・不正は2', () => {
  const root = makeRoot(LEDGER);
  try {
    const io = { ...fixtureIo(root), ...capture() };
    assert.equal(runCli(['check', '--root', root], io), 0);
    writeFileSync(ledgerPathOf(root), LEDGER + '\n## 新規D\n');
    assert.equal(runCli(['check', '--root', root], io), 1);
    assert.equal(runCli(['check', '--bogus'], io), 2);
    assert.equal(runCli([], io), 2);
    // reflection の見出しがスナップショットに無い
    writeFileSync(io.reflectionPath, JSON.stringify({ entries: [{ heading: '## 無い' }] }));
    assert.equal(runCli(['check', '--root', root], io), 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI apply: 全件反映でファイル削除・再実行で0（冪等）', () => {
  const root = makeRoot(LEDGER);
  try {
    const io = { ...fixtureIo(root), ...capture() };
    assert.equal(runCli(['apply', '--root', root], io), 0);
    assert.equal(existsSync(ledgerPathOf(root)), false);
    assert.equal(runCli(['apply', '--root', root], io), 0);
    assert.equal(runCli(['check', '--root', root], io), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI apply: 反映済みの項目を入れた台帳で、反映済みだけが消え、未反映の項目が残る', () => {
  const root = makeRoot(PREAMBLE + LEDGER);
  try {
    const io = { ...writeData(root, [HB], PREAMBLE + LEDGER), ...capture() };
    assert.equal(runCli(['check', '--root', root], io), 0);
    assert.equal(runCli(['apply', '--root', root], io), 0);
    const after = readFileSync(ledgerPathOf(root), 'utf8');
    assert.equal(after, PREAMBLE + A + C);
    assert.ok(!after.includes(HB));
    assert.ok(after.includes(HA) && after.includes(HC));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI apply: 不一致は書かずに1', () => {
  const changed = LEDGER + '\n## 新規D\n- 種別: x\n';
  const root = makeRoot(changed);
  try {
    const io = { ...fixtureIo(root), ...capture() };
    assert.equal(runCli(['apply', '--root', root], io), 1);
    assert.equal(readFileSync(ledgerPathOf(root), 'utf8'), changed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI apply: --accept-additions は追記分を残す', () => {
  const root = makeRoot(LEDGER + '\n## 新規D\n- 種別: x\n');
  try {
    const io = { ...fixtureIo(root), ...capture() };
    assert.equal(runCli(['apply', '--root', root, '--accept-additions'], io), 0);
    assert.equal(readFileSync(ledgerPathOf(root), 'utf8'), '## 新規D\n- 種別: x\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI apply: 追記でない差分は --accept-additions でも書かずに1', () => {
  const changed = LEDGER.replace('- 提案: b', '- 提案: X');
  const root = makeRoot(changed);
  try {
    const io = { ...fixtureIo(root), ...capture() };
    assert.equal(runCli(['apply', '--root', root, '--accept-additions'], io), 1);
    assert.equal(readFileSync(ledgerPathOf(root), 'utf8'), changed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- 反映済みの項目が0件のとき（台帳が配置前に存在しなかった場合） ---

test('CLI（反映済み0件）: 台帳が無くても check は0・apply は何も作らず0', () => {
  const root = makeRoot(null);
  try {
    const io = { ...writeData(root, [], ''), ...capture() };
    assert.equal(runCli(['check', '--root', root], io), 0);
    assert.match(io.lines.join('\n'), /反映済み 0 件・未反映 0 件/);
    assert.equal(runCli(['apply', '--root', root], io), 0);
    assert.equal(existsSync(ledgerPathOf(root)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI（反映済み0件）: 案内文だけの台帳・追記された台帳があっても、check は0・apply は何も消さない', () => {
  for (const ledger of [PREAMBLE, PREAMBLE + A + B]) {
    const root = makeRoot(ledger);
    try {
      const io = { ...writeData(root, [], ''), ...capture() };
      assert.equal(runCli(['check', '--root', root], io), 0);
      assert.equal(runCli(['apply', '--root', root], io), 0);
      assert.equal(readFileSync(ledgerPathOf(root), 'utf8'), ledger);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('CLI: entries が配列でない・見出しが文字列でない reflection.json は2', () => {
  const root = makeRoot(null);
  try {
    const io = { ...writeData(root, [], ''), ...capture() };
    writeFileSync(io.reflectionPath, JSON.stringify({ entries: 'x' }));
    assert.equal(runCli(['check', '--root', root], io), 2);
    writeFileSync(io.reflectionPath, JSON.stringify({ entries: [{ heading: 1 }] }));
    assert.equal(runCli(['check', '--root', root], io), 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- 直接実行と同梱データの整合 ---

test('直接実行: 同梱データに対して check が0（台帳が無くても案内文だけでも）', () => {
  for (const ledger of [null, PREAMBLE]) {
    const root = makeRoot(ledger);
    try {
      const r = spawnSync(process.execPath, [SCRIPT, 'check', '--root', root], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, /反映済み 0 件・未反映 0 件/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('同梱の reflection.json と ledger-snapshot.txt: 反映済みは0件で、スナップショットは空で整合している', () => {
  assert.ok(Array.isArray(realReflection.entries));
  assert.equal(realReflection.entries.length, 0);
  assert.equal(typeof realReflection.canon_run, 'string');
  assert.equal(realReflection.ledger, 'tasks/lessons.md');
  assert.equal(realReflection.snapshot, 'ledger-snapshot.txt');
  assert.equal(realSnapshot, '');
  assert.deepEqual(parseLedger(realSnapshot).entries, []);
});

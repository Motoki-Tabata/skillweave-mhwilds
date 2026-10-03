import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildBody,
  extractAcceptanceCriteria,
  extractOutsideChanges,
  extractSection,
  fillSection,
  parseTemplate,
  stripComments,
} from './pr-body.mjs';

const TEMPLATE = [
  '<!--',
  '説明のコメント。',
  '## この見出しはコメントの中',
  '-->',
  '',
  '## 仕様ID',
  '',
  'specs/NNN-\\<slug\\>',
  '',
  '## このPRが満たす受入基準',
  '',
  '- [ ] 受入基準 1: ...',
  '',
  '## 契約変更',
  '',
  'なし / あり',
  '',
  '## 常時許可外の変更',
  '',
  'なし / あり',
  '',
  '## handoff の「PR 本文に必須の記載事項」',
  '',
  '（転記する）',
  '',
  '## スコープ',
  '',
  '- [ ] 「スコープ外」の実装をしていない',
  '',
].join('\n');

const SPEC = [
  '# 010: x',
  '',
  '## 受入基準（EARS記法）',
  '',
  '1. THE system SHALL a しなければならない。',
  '2. WHEN b THE system SHALL c しなければならない。',
  '',
  '## スコープ外',
  '- なし',
].join('\n');

const CTX = {
  specId: 'specs/010-solver-spike',
  criteria: extractAcceptanceCriteria(SPEC),
  contractChanged: true,
  contractFiles: ['contracts/openapi.yaml'],
  outsideChanges: [],
  handoffRequired: '<!-- メモ -->\n- 常時許可外の変更: なし',
};

test('parseTemplate: 先頭のコメントを捨て、見出しごとに分ける', () => {
  const sections = parseTemplate(TEMPLATE);
  assert.deepEqual(
    sections.map((s) => s.heading),
    ['仕様ID', 'このPRが満たす受入基準', '契約変更', '常時許可外の変更', 'handoff の「PR 本文に必須の記載事項」', 'スコープ'],
  );
});

test('parseTemplate: このリポジトリの .github/pull_request_template.md の見出しを、欄を落とさず読める', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const real = readFileSync(path.join(root, '.github/pull_request_template.md'), 'utf8');
  const headings = parseTemplate(real).map((s) => s.heading);
  assert.ok(headings.length >= 5, headings.join(' / '));
  const { body } = buildBody(parseTemplate(real), CTX);
  for (const h of headings) assert.ok(body.includes(`## ${h}`), h);
});

test('extractSection: 前方一致で節の本文を取る。無ければ null', () => {
  assert.equal(extractSection(SPEC, 'スコープ外'), '- なし');
  assert.equal(extractSection(SPEC, '存在しない'), null);
});

test('stripComments: HTML コメントだけを除く', () => {
  assert.equal(stripComments('a <!-- b --> c'), 'a  c');
});

test('extractAcceptanceCriteria: 番号つきと箇条書きの両方を拾う', () => {
  assert.deepEqual(
    extractAcceptanceCriteria(SPEC).map((c) => c.no),
    [1, 2],
  );
  const bullets = '## 受入基準（EARS記法）\n- x\n- y\n## 次\n';
  assert.deepEqual(
    extractAcceptanceCriteria(bullets).map((c) => c.no),
    [1, 2],
  );
});

test('extractOutsideChanges: なし・節なしは空、列挙があれば取る', () => {
  assert.deepEqual(extractOutsideChanges('## 常時許可外の変更\n- なし\n'), []);
  assert.deepEqual(extractOutsideChanges('## スタック\nx\n'), []);
  assert.deepEqual(extractOutsideChanges(null), []);
  assert.deepEqual(extractOutsideChanges('## 常時許可外の変更\n- `apps/api/build.gradle.kts`（理由）\n'), [
    '`apps/api/build.gradle.kts`（理由）',
  ]);
});

test('fillSection: 契約変更の有無で書き分ける', () => {
  assert.equal(fillSection('契約変更', { contractChanged: false }), 'なし');
  assert.match(fillSection('契約変更', { contractChanged: true, contractFiles: ['contracts/a.yaml'] }), /あり.*\n.*contracts\/a\.yaml/s);
  assert.equal(fillSection('契約変更', { contractChanged: null }), null);
});

test('buildBody: テンプレートの見出しをすべて、順序どおりに残す', () => {
  const { body } = buildBody(parseTemplate(TEMPLATE), CTX);
  const headings = body.split('\n').filter((l) => l.startsWith('## '));
  assert.deepEqual(headings, [
    '## 仕様ID',
    '## このPRが満たす受入基準',
    '## 契約変更',
    '## 常時許可外の変更',
    '## handoff の「PR 本文に必須の記載事項」',
    '## スコープ',
  ]);
  assert.match(body, /specs\/010-solver-spike/);
  assert.match(body, /- \[ \] 受入基準 1: THE system SHALL a/);
  assert.match(body, /contracts\/openapi\.yaml/);
  assert.match(body, /常時許可外の変更: なし/);
  assert.ok(!body.includes('<!--'));
});

test('buildBody: 常時許可外の変更があれば、1行1パスで本文に載せる', () => {
  const { body } = buildBody(parseTemplate(TEMPLATE), {
    ...CTX,
    outsideChanges: ['`pnpm-workspace.yaml`（catalog に追加）'],
  });
  assert.match(body, /## 常時許可外の変更\n\nあり\n- `pnpm-workspace\.yaml`（catalog に追加）/);
});

test('buildBody: テンプレートに未知の見出しが増えても欄を落とさず、本文を残して kept に挙げる', () => {
  const extended = `${TEMPLATE}\n## 動作確認\n\n手順を書く\n`;
  const { body, kept } = buildBody(parseTemplate(extended), CTX);
  assert.match(body, /## 動作確認\n\n手順を書く/);
  assert.deepEqual(kept, ['スコープ', '動作確認']);
});

test('buildBody: 見出しの語が変わっても対応する欄を埋める（見出しを転記していない）', () => {
  const renamed = parseTemplate('## 関連する仕様ID\n\nx\n\n## 変更される契約\n\nx\n');
  const { body, kept } = buildBody(renamed, { ...CTX, contractChanged: false });
  assert.match(body, /## 関連する仕様ID\n\nspecs\/010-solver-spike/);
  assert.match(body, /## 変更される契約\n\nなし/);
  assert.deepEqual(kept, []);
});

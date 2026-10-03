import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AREA_VOCAB, checkSpec, comparePlan, formatTable, parseSpec } from './spec-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// fixture の許可表は、役割名・パス・領域語とも swv のものだけで書く。
const SCOPES = {
  roles: {
    'api-agent': ['apps/api/src/main/java/**', 'apps/api/src/main/resources/application*.yml'],
    'web-agent': ['apps/web/src/main/**'],
    'api-test-agent': ['apps/api/src/test/**'],
    'web-test-agent': ['apps/web/src/test/**'],
    'e2e-agent': ['apps/web/e2e/**'],
    'contract-agent': ['contracts/**'],
    'data-model-agent': [
      'apps/api/src/main/resources/db/migration/**',
      'design/data-model-standard.md',
      'design/attributes.yaml',
    ],
    'solver-agent': ['packages/solver/src/main/**'],
    'solver-test-agent': ['packages/solver/src/test/**'],
    'data-agent': ['packages/data/src/main/**'],
    'data-test-agent': ['packages/data/src/test/**'],
  },
};

function acceptanceBlock(n) {
  return Array.from({ length: n }, (_, i) => `- WHEN ... THE system SHALL 項目${i + 1} しなければならない。`).join('\n');
}

function makeSpec({
  acceptanceCount = 5,
  areaLine = '触る領域: api, web',
  alwaysExcluded = '常時許可外の変更予定: なし',
  omitSections = [],
} = {}) {
  const sections = {
    '## 目的 / ユーザーストーリー': '誰として、何をしたいか。',
    '## 受入基準（EARS記法）': acceptanceBlock(acceptanceCount),
    '## スコープ外': '- やらないこと',
    '## 契約差分': '- 追加: GET /x',
    '## 影響範囲': `${areaLine}\n${alwaysExcluded}`,
    '## 依存する機能ID': 'なし',
  };
  const parts = ['# 007: サンプル機能', ''];
  for (const [heading, body] of Object.entries(sections)) {
    if (omitSections.includes(heading)) continue;
    parts.push(heading, body, '');
  }
  return parts.join('\n');
}

test('新書式の正常な spec は全 OK', () => {
  const text = makeSpec();
  const result = checkSpec(text, SCOPES);
  assert.equal(result.overallOk, true);
  assert.ok(result.rows.every((r) => r.ok));
});

test('AREA_VOCAB: 6語で、impact-scope/SKILL.md の「触る領域」の語彙と一致する', () => {
  assert.deepEqual(AREA_VOCAB, ['api', 'web', 'solver', 'data', 'contracts', 'docker']);
  const skill = fs.readFileSync(path.join(__dirname, '../../impact-scope/SKILL.md'), 'utf8');
  const line = skill.split('\n').find((l) => l.includes('`触る領域:`') && l.includes('語彙は'));
  assert.ok(line, 'impact-scope/SKILL.md に「触る領域」の語彙の行が見当たらない');
  const words = [...line.slice(line.indexOf('語彙は')).matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
  assert.deepEqual(words, AREA_VOCAB);
});

test('触る領域: 6語の語彙は、どれも単独で OK', () => {
  for (const area of AREA_VOCAB) {
    const result = checkSpec(makeSpec({ areaLine: `触る領域: ${area}` }), SCOPES);
    assert.equal(result.rows[3].ok, true, area);
  }
  const three = checkSpec(makeSpec({ areaLine: '触る領域: solver, data, contracts' }), SCOPES);
  assert.equal(three.rows[3].ok, true);
});

test('必須節の欠落を検出する', () => {
  const text = makeSpec({ omitSections: ['## スコープ外'] });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[0].ok, false);
  assert.match(result.rows[0].note, /スコープ外/);
});

test('受入基準16個は NG', () => {
  const text = makeSpec({ acceptanceCount: 16 });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[1].ok, false);
});

test('触る領域の欠落は NG', () => {
  const text = makeSpec({ areaLine: '' });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[3].ok, false);
});

test('触る領域の語彙外は NG', () => {
  const text = makeSpec({ areaLine: '触る領域: api, mobile' });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[3].ok, false);
  assert.match(result.rows[3].note, /語彙外: mobile/);
});

test('触る領域4つは NG（語彙内でも）', () => {
  const text = makeSpec({ areaLine: '触る領域: api, web, solver, data' });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[3].ok, false);
});

test('「なし」と箇条書きの併存は NG', () => {
  const text = makeSpec({ alwaysExcluded: '常時許可外の変更予定: なし\n- `apps/api/build.gradle.kts`（理由）' });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[4].ok, false);
});

test('1行2パスは NG', () => {
  const text = makeSpec({
    alwaysExcluded: '常時許可外の変更予定:\n- `apps/api/build.gradle.kts` と `apps/web/package.json`（理由）',
  });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[4].ok, false);
});

test('glob を含むパスは NG', () => {
  const text = makeSpec({
    alwaysExcluded: '常時許可外の変更予定:\n- `apps/api/**/build.gradle.kts`（理由）',
  });
  const result = checkSpec(text, SCOPES);
  assert.equal(result.rows[4].ok, false);
});

test('許可フォルダ内のパスは「不要な記載」で NG（solver・data の許可フォルダを含む）', () => {
  for (const p of ['apps/api/src/main/java/Foo.java', 'packages/solver/src/main/a.ts', 'packages/data/src/test/a.spec.ts']) {
    const text = makeSpec({ alwaysExcluded: `常時許可外の変更予定:\n- \`${p}\`（理由）` });
    const result = checkSpec(text, SCOPES);
    assert.equal(result.rows[5].ok, false, p);
    assert.match(result.rows[5].note, /不要な記載/);
  }
});

test('許可フォルダ外の正当なパスは OK（共有構成ファイル。packages/data/dist も許可フォルダ外）', () => {
  for (const p of ['apps/api/build.gradle.kts', 'pnpm-workspace.yaml', 'packages/solver/package.json', 'apps/web/vitest.config.ts']) {
    const text = makeSpec({ alwaysExcluded: `常時許可外の変更予定:\n- \`${p}\`（理由）` });
    const result = checkSpec(text, SCOPES);
    assert.equal(result.rows[4].ok, true, p);
    assert.equal(result.rows[5].ok, true, p);
  }
});

test('compare-plan: 3区分（両方・planのみ・specのみ）', () => {
  const specText = makeSpec({
    alwaysExcluded:
      '常時許可外の変更予定:\n- `apps/api/build.gradle.kts`（理由A）\n- `apps/web/package.json`（理由B）',
  });
  const specResult = checkSpec(specText, SCOPES);
  const planText = [
    '## 常時許可外の変更',
    '- `apps/api/build.gradle.kts`（担当: メイン。理由A）',
    '- `pnpm-workspace.yaml`（担当: メイン。理由C）',
  ].join('\n');
  const cmp = comparePlan(specResult, planText, SCOPES);
  assert.equal(cmp.sectionMissing, false);
  assert.deepEqual(cmp.both, ['apps/api/build.gradle.kts']);
  assert.deepEqual(cmp.planOnly, ['pnpm-workspace.yaml']);
  assert.deepEqual(cmp.specOnly, ['apps/web/package.json']);
});

test('compare-plan: plan の節が無ければ終了コード相当の sectionMissing を返す', () => {
  const specText = makeSpec();
  const specResult = checkSpec(specText, SCOPES);
  const planText = '## スタック\n何か\n';
  const cmp = comparePlan(specResult, planText, SCOPES);
  assert.equal(cmp.sectionMissing, true);
});

test('formatTable: 固定フォーマットの表を出力する', () => {
  const text = makeSpec();
  const result = checkSpec(text, SCOPES);
  const table = formatTable(result, '007-sample', null);
  assert.match(table, /## 薄仕様 機械判定結果（007-sample）/);
  assert.match(table, /\| # \| 項目 \| 判定 \| 備考 \|/);
  assert.match(table, /総合: OK/);
});

test('parseSpec: 影響範囲節が無ければ impactSectionFound は false', () => {
  const text = makeSpec({ omitSections: ['## 影響範囲'] });
  const parsed = parseSpec(text);
  assert.equal(parsed.impactSectionFound, false);
});

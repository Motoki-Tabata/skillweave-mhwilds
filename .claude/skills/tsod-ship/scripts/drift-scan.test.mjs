import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildPlan, detectE2eConfigured, parseArgs as parseVerifyArgs } from '../../tsod-verify/scripts/verify.mjs';
import {
  buildSections,
  checkAcceptanceCoverage,
  checkAgentList,
  checkCommandsConsistency,
  checkDecisionsMigrated,
  checkEndpoints,
  criteriaNumbers,
  DRIFT_PLAN_ARGS,
  extractCiTokens,
  extractEndpoints,
  findUnclaimedReservations,
  formatChecklist,
  mentionedCriteria,
  parseCriteriaNumbers,
  TABLE_ONLY_INTENTIONAL,
  tokensFromCommandLine,
  tokensFromCommandsTable,
  tokensFromPlan,
} from './drift-scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const SPEC = [
  '# 010: x',
  '',
  '## 受入基準（EARS記法）',
  '',
  '1. THE system SHALL a しなければならない。',
  '2. WHEN b THE system SHALL c しなければならない。',
  '3. WHEN d THE system SHALL e しなければならない。',
  '',
  '## スコープ外',
  '',
  '- 区分ごとの更新 API `PUT /api/items/defaults/{kind}`（扱わない）',
  '',
  '## 契約差分',
  '',
  '- 追加: `GET /api/items/defaults`（認証済みのユーザー）',
  '- 追加: `PUT /api/items/defaults`（認証済みのユーザー）',
  '',
  '## 影響範囲',
].join('\n');

// ---- 1. 受入基準

test('parseCriteriaNumbers: 列挙と範囲を展開する', () => {
  assert.deepEqual([...parseCriteriaNumbers('1, 2, 4')].sort(), [1, 2, 4]);
  assert.deepEqual([...parseCriteriaNumbers('2〜4')].sort(), [2, 3, 4]);
});

test('mentionedCriteria: 「受入基準 N」と AC-N の言及を拾う', () => {
  const nums = mentionedCriteria('refs spec §契約差分, §受入基準 2, 3\n// AC-5 で確かめる');
  assert.deepEqual([...nums].sort(), [2, 3, 5]);
});

test('criteriaNumbers: 番号つきの受入基準の番号を取る', () => {
  assert.deepEqual(criteriaNumbers(SPEC), [1, 2, 3]);
});

test('checkAcceptanceCoverage: tasks にもテストにも現れない番号を検出する（違反の注入）', () => {
  const tasks = '- [ ] T1 refs spec §受入基準 1, 2\n- [ ] T2 refs spec §受入基準 1';
  const tests = [{ file: 'apps/api/src/test/java/A.java', text: '// 受入基準 1\n@Test void x() {}' }];
  const r = checkAcceptanceCoverage([1, 2, 3], tasks, tests);
  assert.deepEqual(
    r.map((x) => [x.no, x.inTasks, x.inTests]),
    [
      [1, true, true],
      [2, true, false],
      [3, false, false],
    ],
  );
  assert.deepEqual(r[0].files, ['apps/api/src/test/java/A.java']);
});

// ---- 2. 契約

test('extractEndpoints: 契約差分の節だけから取り、スコープ外の記載は拾わない', () => {
  assert.deepEqual(extractEndpoints(SPEC), [
    { method: 'GET', path: '/api/items/defaults' },
    { method: 'PUT', path: '/api/items/defaults' },
  ]);
});

const OPENAPI = [
  'paths:',
  '  /api/items/defaults:',
  "    $ref: './paths/items/items-defaults.yaml'",
  '  /api/other:',
  '    get:',
  '      x-swv-status: draft',
].join('\n');

test('checkEndpoints: 辿れて draft が無ければ ok', () => {
  const read = () => 'get:\n  operationId: a\nput:\n  operationId: b\n';
  const r = checkEndpoints(extractEndpoints(SPEC), OPENAPI, read);
  assert.ok(r.every((x) => x.ok));
});

test('checkEndpoints: draft の残存・メソッド欠落・paths に無い・参照先が読めない、を検出する（違反の注入）', () => {
  const withDraft = checkEndpoints([{ method: 'GET', path: '/api/items/defaults' }], OPENAPI, () => 'get:\n  x-swv-status: draft\n');
  assert.equal(withDraft[0].ok, false);
  assert.match(withDraft[0].problems.join(), /draft/);

  const noMethod = checkEndpoints([{ method: 'PUT', path: '/api/items/defaults' }], OPENAPI, () => 'get:\n  operationId: a\n');
  assert.match(noMethod[0].problems.join(), /put の定義が無い/);

  const missing = checkEndpoints([{ method: 'GET', path: '/api/none' }], OPENAPI, () => '');
  assert.match(missing[0].problems.join(), /paths に無い/);

  const unreadable = checkEndpoints([{ method: 'GET', path: '/api/items/defaults' }], OPENAPI, () => null);
  assert.match(unreadable[0].problems.join(), /参照先を読めない/);
});

test('checkEndpoints: インラインの定義でも draft を検出する', () => {
  const r = checkEndpoints([{ method: 'GET', path: '/api/other' }], OPENAPI, () => null);
  assert.equal(r[0].ok, false);
  assert.match(r[0].problems.join(), /draft/);
});

// ---- 3. decisions と open-questions

test('checkDecisionsMigrated: open-questions に残った Q 番号を検出する（違反の注入）', () => {
  const decisions = '- [x] Q103: a\n- [x] Q104: b\n本文中の Q9 への言及は定義ではない\n';
  const open = '- [ ] Q104: まだ残っている\n- [ ] Q200: 別の項目\n';
  const r = checkDecisionsMigrated(decisions, open);
  assert.deepEqual(r.moved, [103, 104]);
  assert.deepEqual(r.leftover, [104]);
});

test('checkDecisionsMigrated: 残っていなければ leftover は空', () => {
  assert.deepEqual(checkDecisionsMigrated('- [x] Q1: a\n', '- [ ] Q2: b\n').leftover, []);
});

test('checkDecisionsMigrated: open-questions.md が無い（null）ときは異常にせず、残りは無し', () => {
  const r = checkDecisionsMigrated('- [x] Q1: a\n', null);
  assert.deepEqual(r, { moved: [1], leftover: [] });
  assert.deepEqual(checkDecisionsMigrated(null, null), { moved: [], leftover: [] });
  const sections = buildSections({ decisions: { ...r, noDecisions: false, openQuestionsMissing: true } });
  const items = sections[0].items;
  assert.ok(items.every((it) => it.ok));
  assert.match(items[1].text, /open-questions\.md なし/);
});

// ---- 4. Commands 表・verify.mjs・ci.yml

const CLAUDE = [
  '# x',
  '',
  '## Commands',
  '',
  '| 種別 | apps/api（`apps/api` で実行） | pnpm workspace（リポジトリ直下で実行） |',
  '|---|---|---|',
  '| build | `./gradlew build` | `pnpm build` |',
  '| test | `./gradlew test` | `pnpm test:unit` |',
  '| lint | `./gradlew spotlessCheck` | `pnpm lint:check` |',
  '| format | — | `pnpm format:check` |',
  '| typecheck | `./gradlew classes testClasses` | `pnpm type-check` |',
  '| contract | `./gradlew contractTest` | `pnpm contract:lint` |',
  '| 型 | — | `pnpm contract:types` 実行後 `git diff --exit-code -- apps/web/src/main/lib/api/schema.ts` |',
  '| docs | — | `pnpm contract:docs`・`pnpm contract:swagger` |',
  '| coverage | `./gradlew test contractTest jacocoTestReport` | `pnpm test:coverage` |',
  '| 自動修正 | — | `pnpm lint`・`pnpm format` |',
  '',
  '特定のパッケージだけ: `pnpm --filter @swv/web run <script>`・`pnpm --filter \'./packages/*\' run <script>`',
  '',
  '## 次の節',
].join('\n');

const CI = [
  'jobs:',
  '  api:',
  '    steps:',
  '      - name: b',
  '        working-directory: apps/api',
  '        run: ./gradlew spotlessCheck build contractTest --console=plain',
  '  web:',
  '    steps:',
  '      - run: pnpm install --frozen-lockfile',
  '      - run: pnpm --filter @swv/web run lint:check',
  '      - run: pnpm --filter @swv/web run format:check',
  '      - run: pnpm --filter @swv/web run type-check',
  '      - run: pnpm --filter @swv/web run test:unit',
  '      - run: pnpm --filter @swv/web run build',
  '      - run: pnpm contract:lint',
  '      - name: f',
  '        run: |',
  '          pnpm contract:types',
  '          git diff --exit-code -- apps/web/src/main/lib/api/schema.ts',
  '      - name: d',
  '        run: |',
  '          pnpm contract:docs',
  '          pnpm contract:swagger',
  '  packages:',
  '    steps:',
  "      - run: pnpm --filter './packages/*' run lint:check",
  "      - run: pnpm --filter './packages/*' run format:check",
  "      - run: pnpm --filter './packages/*' run type-check",
  "      - run: pnpm --filter './packages/*' run test:unit",
].join('\n');

// e2e が未設定の間の計画（e2e の段はコマンドを持たない SKIP になる）
const PLAN = buildPlan(parseVerifyArgs(DRIFT_PLAN_ARGS), { e2eConfigured: false });

test('DRIFT_PLAN_ARGS は --e2e のまま', () => {
  assert.deepEqual(DRIFT_PLAN_ARGS, ['--e2e']);
});

test('tokensFromCommandLine: --filter 形・-r 形・run 形・直接形を同じ pnpm:<script> にする', () => {
  for (const cmd of [
    'pnpm --filter @swv/web run lint:check',
    "pnpm --filter './packages/*' run lint:check",
    'pnpm -r run lint:check',
    'pnpm run lint:check',
    'pnpm lint:check',
    'pnpm --filter=@swv/web lint:check',
    'cd . && pnpm --filter @swv/data run lint:check',
  ]) {
    assert.deepEqual(tokensFromCommandLine(cmd), ['pnpm:lint:check'], cmd);
  }
});

test('tokensFromCommandLine: pnpm contract:* 形と ./gradlew 形（オプションは捨てる）', () => {
  assert.deepEqual(tokensFromCommandLine('pnpm contract:docs'), ['pnpm:contract:docs']);
  assert.deepEqual(tokensFromCommandLine('pnpm contract:types'), ['pnpm:contract:types']);
  assert.deepEqual(tokensFromCommandLine('./gradlew spotlessCheck build contractTest --console=plain'), [
    'gradle:spotlessCheck',
    'gradle:build',
    'gradle:contractTest',
  ]);
  assert.deepEqual(tokensFromCommandLine('./gradlew build --rerun-tasks --console=plain'), ['gradle:build']);
});

test('tokensFromCommandLine: install・exec・add・dlx と、<...> のプレースホルダはトークンにしない', () => {
  for (const cmd of [
    'pnpm install --frozen-lockfile',
    'pnpm exec openapi-typescript x -o y',
    'pnpm add lodash',
    'pnpm dlx x',
    'pnpm --filter @swv/web run <script>',
    "pnpm --filter './packages/*' run <script>",
    'pnpm <script>',
    'git diff --exit-code -- a',
    'nohup ./gradlew bootRun --console=plain > /tmp/b.log 2>&1 &',
  ]) {
    assert.deepEqual(tokensFromCommandLine(cmd), [], cmd);
  }
});

test('extractCiTokens: 1行とブロックの run: から pnpm・gradle のトークンを取る（素通りでない）', () => {
  const t = extractCiTokens(CI);
  assert.ok(t.size > 0);
  assert.ok(t.has('pnpm:lint:check'));
  assert.ok(t.has('pnpm:contract:types'));
  assert.ok(t.has('pnpm:contract:swagger'));
  assert.ok(t.has('gradle:spotlessCheck'));
  assert.ok(!t.has('pnpm:install'));
});

test('tokensFromCommandsTable: Commands 節のバッククォートからトークンを取る（プレースホルダは除く）', () => {
  const t = tokensFromCommandsTable(CLAUDE);
  assert.ok(t.has('gradle:classes'));
  assert.ok(t.has('pnpm:contract:docs'));
  assert.ok(t.has('pnpm:test:coverage'));
  assert.ok(![...t].some((x) => x.includes('<')));
});

test('tokensFromPlan: 実行計画のコマンドと一時生成のフレッシュネスを数える', () => {
  const t = tokensFromPlan(PLAN);
  assert.ok(t.has('gradle:contractTest'));
  assert.ok(t.has('pnpm:contract:docs'));
  assert.ok(t.has('pnpm:contract:types'));
  assert.ok(t.has('pnpm:lint:check'));
  assert.ok(t.has('pnpm:test:unit'));
});

test('tokensFromPlan: e2e が未設定の間、計画に pnpm:test:e2e は入らない。設定済みなら入る', () => {
  assert.ok(!tokensFromPlan(PLAN).has('pnpm:test:e2e'));
  const configured = buildPlan(parseVerifyArgs(DRIFT_PLAN_ARGS), { e2eConfigured: true });
  assert.ok(tokensFromPlan(configured).has('pnpm:test:e2e'));
});

test('checkCommandsConsistency: 一致していれば指摘なし（意図的な差は除く）', () => {
  assert.deepEqual(checkCommandsConsistency({ plan: PLAN, claudeMdText: CLAUDE, ciText: CI }), []);
});

test('checkCommandsConsistency: e2e が未設定なら、表・ci.yml に e2e が無くても指摘を出さない（偽陽性なし）', () => {
  const f = checkCommandsConsistency({ plan: PLAN, claudeMdText: CLAUDE, ciText: CI });
  assert.ok(!f.some((x) => x.token === 'pnpm:test:e2e'));
});

test('checkCommandsConsistency: e2e が設定済みになったら、表と ci.yml に e2e が無いことを検出する（違反の注入）', () => {
  const configured = buildPlan(parseVerifyArgs(DRIFT_PLAN_ARGS), { e2eConfigured: true });
  const f = checkCommandsConsistency({ plan: configured, claudeMdText: CLAUDE, ciText: CI });
  assert.ok(f.some((x) => x.kind === 'plan-not-in-table' && x.token === 'pnpm:test:e2e'));
  assert.ok(f.some((x) => x.kind === 'plan-not-in-ci' && x.token === 'pnpm:test:e2e'));
});

test('checkCommandsConsistency: 表から行を消した違反を検出する（違反の注入）', () => {
  const broken = CLAUDE.replace(/\| docs \|.*\n/, '');
  const f = checkCommandsConsistency({ plan: PLAN, claudeMdText: broken, ciText: CI });
  assert.ok(f.some((x) => x.kind === 'plan-not-in-table' && x.token === 'pnpm:contract:docs'));
});

test('checkCommandsConsistency: ci.yml にだけあるコマンド・verify.mjs にだけあるコマンドを検出する（違反の注入）', () => {
  const ciExtra = `${CI}\n      - run: pnpm audit-extra`;
  const f1 = checkCommandsConsistency({ plan: PLAN, claudeMdText: CLAUDE, ciText: ciExtra });
  assert.ok(f1.some((x) => x.kind === 'ci-not-in-plan' && x.token === 'pnpm:audit-extra'));

  const ciLess = CI.replace('pnpm contract:docs', 'echo skipped');
  const f2 = checkCommandsConsistency({ plan: PLAN, claudeMdText: CLAUDE, ciText: ciLess });
  assert.ok(f2.some((x) => x.kind === 'plan-not-in-ci' && x.token === 'pnpm:contract:docs'));
});

test('checkCommandsConsistency: 表にだけあり、意図的な差にも無いコマンドを検出する（違反の注入）', () => {
  const extra = CLAUDE.replace('## 次の節', '追加: `pnpm only-in-table`\n\n## 次の節');
  const f = checkCommandsConsistency({ plan: PLAN, claudeMdText: extra, ciText: CI });
  assert.ok(f.some((x) => x.kind === 'table-not-in-plan' && x.token === 'pnpm:only-in-table'));
});

test('TABLE_ONLY_INTENTIONAL: 表にだけ現れてよいコマンドの集合', () => {
  assert.deepEqual(
    [...TABLE_ONLY_INTENTIONAL].sort(),
    [
      'gradle:classes',
      'gradle:jacocoTestReport',
      'gradle:test',
      'gradle:testClasses',
      'pnpm:format',
      'pnpm:lint',
      'pnpm:test:coverage',
    ],
  );
});

// 配置先のリポジトリ直下の実物（CLAUDE.md・ci.yml）を読む回帰テスト。
const realClaude = readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
const realCi = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
const realPlan = buildPlan(parseVerifyArgs(DRIFT_PLAN_ARGS), { e2eConfigured: detectE2eConfigured(REPO_ROOT) });

test('実物の CLAUDE.md・ci.yml: drift-scan の計画との指摘が0件（e2e の偽陽性を出さない）', () => {
  const f = checkCommandsConsistency({ plan: realPlan, claudeMdText: realClaude, ciText: realCi });
  assert.deepEqual(f, []);
});

test('実物の ci.yml: トークンが1件以上取れ、--filter 形・pnpm contract:* 形・./gradlew 形が期待のトークンになる（素通りでない）', () => {
  const t = extractCiTokens(realCi);
  assert.ok(t.size > 0, 'ci.yml から1件もトークンが取れない');
  assert.ok(t.has('pnpm:lint:check'), '--filter 形が pnpm:lint:check にならない');
  assert.ok(t.has('pnpm:contract:lint'), 'pnpm contract:* 形が取れない');
  assert.ok(t.has('gradle:contractTest'), './gradlew 形が gradle:<task> にならない');
  assert.ok(![...t].some((x) => x.includes('--filter')));
});

test('実物の CLAUDE.md: Commands 節からトークンが取れる', () => {
  const t = tokensFromCommandsTable(realClaude);
  assert.ok(t.size > 0);
  assert.ok(t.has('pnpm:lint:check'));
  assert.ok(t.has('gradle:build'));
});

test('実物の CLAUDE.md から Commands 表の行を削ると、指摘が出る（違反の注入）', () => {
  const dropped = realClaude
    .split('\n')
    .filter((l) => !l.includes('contract:docs'))
    .join('\n');
  const f = checkCommandsConsistency({ plan: realPlan, claudeMdText: dropped, ciText: realCi });
  assert.ok(f.some((x) => x.kind === 'plan-not-in-table' && x.token === 'pnpm:contract:docs'));
});

test('実物の ci.yml に未記載のコマンドを足すと、指摘が出る（違反の注入）', () => {
  const f = checkCommandsConsistency({
    plan: realPlan,
    claudeMdText: realClaude,
    ciText: `${realCi}\n      - run: pnpm audit-extra\n`,
  });
  assert.ok(f.some((x) => x.kind === 'ci-not-in-plan' && x.token === 'pnpm:audit-extra'));
});

// ---- 5. Subagent 一覧

test('checkAgentList: README に無い Subagent・実在しない記載を検出する（違反の注入）', () => {
  const readme = '| `api-agent` | x |\n| `ghost-agent` | y |\n';
  const r = checkAgentList(readme, ['api-agent', 'test-investigator']);
  assert.deepEqual(r.missingInReadme, ['test-investigator']);
  assert.deepEqual(r.extraInReadme, ['ghost-agent']);
  assert.equal(checkAgentList(null, []).readmeMissing, true);
});

// ---- 6. temp/

test('findUnclaimedReservations: 当該機能 ID の未卒業の予約だけを検出する（違反の注入）', () => {
  const files = [
    {
      file: 'temp/req.md',
      text: '- 未卒業（§3.3.1 は機能011 で卒業）\n- 未卒業（§9 は機能0110 で卒業）\n- 卒業済み（機能011）\n',
    },
  ];
  const hits = findUnclaimedReservations(files, '011');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
  assert.deepEqual(findUnclaimedReservations(files, '012'), []);
});

// ---- 出力

test('formatChecklist: 指摘の件数を数え、チェックボックスで書く', () => {
  const sections = buildSections({
    coverage: [{ no: 1, inTasks: true, inTests: false, files: [] }],
    temp: [],
  });
  const { markdown, findings, checked } = formatChecklist('010', sections);
  assert.equal(findings, 1);
  assert.equal(checked, 2);
  assert.match(markdown, /- \[ \] 受入基準 1/);
  assert.match(markdown, /- \[x\] 当該機能 ID の未卒業の予約は残っていない/);
  assert.match(markdown, /機械検出の指摘: 1 件/);
});

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildPlan,
  classifyContractTest,
  detectE2eConfigured,
  exitCodeOf,
  extractSonarCounts,
  formatSummary,
  judgeFreshness,
  parseArgs,
  scanDraftMarkers,
  sonarCountsLine,
} from './verify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SONAR_SH = path.join(REPO_ROOT, 'scripts/sonar-local.sh');

const DEFAULTS = { only: null, e2e: false, sonar: false, dryRun: false, allowDraft: false, sonarArea: null, base: null };

test('parseArgs: 既定値', () => {
  assert.deepEqual(parseArgs([]), DEFAULTS);
});

test('parseArgs: --only api', () => {
  assert.equal(parseArgs(['--only', 'api']).only, 'api');
});

test('parseArgs: --e2e --sonar --dry-run', () => {
  const opts = parseArgs(['--e2e', '--sonar', '--dry-run']);
  assert.equal(opts.e2e, true);
  assert.equal(opts.sonar, true);
  assert.equal(opts.dryRun, true);
});

test('parseArgs: --allow-draft は allowDraft: true（既定は false）', () => {
  assert.equal(parseArgs(['--allow-draft']).allowDraft, true);
  assert.equal(parseArgs(['--only', 'api', '--allow-draft']).allowDraft, true);
  assert.equal(parseArgs([]).allowDraft, false);
});

test('parseArgs: 不正な --only 値はエラー', () => {
  assert.throws(() => parseArgs(['--only', 'nope']));
});

test('parseArgs: --only に取れるのは api・web・packages・e2e・sonar だけ（test・contract・solver・data は無い）', () => {
  for (const ok of ['api', 'web', 'packages', 'e2e', 'sonar']) {
    assert.equal(parseArgs(['--only', ok]).only, ok);
  }
  for (const bad of ['test', 'contract', 'solver', 'data']) {
    assert.throws(() => parseArgs(['--only', bad]));
  }
});

test('parseArgs: --only 値の省略はエラー', () => {
  assert.throws(() => parseArgs(['--only']));
});

test('parseArgs: 不明な引数はエラー', () => {
  assert.throws(() => parseArgs(['--bogus']));
});

test('parseArgs: --sonar-area は api・web・packages だけを取る', () => {
  for (const ok of ['api', 'web', 'packages']) {
    assert.equal(parseArgs(['--sonar-area', ok]).sonarArea, ok);
  }
  assert.equal(parseArgs([]).sonarArea, null);
  for (const bad of ['e2e', 'sonar', 'nope', 'solver']) {
    assert.throws(() => parseArgs(['--sonar-area', bad]));
  }
  assert.throws(() => parseArgs(['--sonar-area']));
});

test('parseArgs: --sonar-area は --only・--e2e・--sonar と併用するとエラー（順序によらない）', () => {
  assert.throws(() => parseArgs(['--sonar-area', 'api', '--only', 'api']));
  assert.throws(() => parseArgs(['--only', 'api', '--sonar-area', 'api']));
  assert.throws(() => parseArgs(['--sonar-area', 'web', '--e2e']));
  assert.throws(() => parseArgs(['--sonar', '--sonar-area', 'packages']));
});

test('parseArgs: --sonar-area は --dry-run・--allow-draft とは併用できる', () => {
  const opts = parseArgs(['--sonar-area', 'api', '--dry-run']);
  assert.equal(opts.sonarArea, 'api');
  assert.equal(opts.dryRun, true);
});

test('parseArgs: --base は --sonar-area と一緒のときだけ有効', () => {
  assert.equal(parseArgs(['--sonar-area', 'api', '--base', 'origin/main']).base, 'origin/main');
  assert.equal(parseArgs(['--base', 'origin/main', '--sonar-area', 'web']).base, 'origin/main');
  assert.throws(() => parseArgs(['--base', 'origin/main']));
  assert.throws(() => parseArgs(['--only', 'api', '--base', 'origin/main']));
});

test('parseArgs: --base の値の省略はエラー', () => {
  assert.throws(() => parseArgs(['--sonar-area', 'api', '--base']));
  assert.throws(() => parseArgs(['--sonar-area', 'api', '--base', '--dry-run']));
});

// --- 実行計画 ---

test('buildPlan: 既定は api・web・packages に、コマンドを持たない e2e・sonar の SKIP（未指定）が付く', () => {
  const plan = buildPlan({ ...DEFAULTS });
  const areas = new Set(plan.map((s) => s.area));
  assert.deepEqual(areas, new Set(['api', 'web', 'packages', 'e2e', 'sonar']));
  for (const area of ['e2e', 'sonar']) {
    const steps = plan.filter((s) => s.area === area);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].skip, '未指定');
    assert.equal(steps[0].command, undefined);
  }
});

test('buildPlan: e2e が未設定なら、--e2e を付けても --only e2e でも、コマンドを持たない SKIP（未設定）の1段', () => {
  for (const options of [{ ...DEFAULTS, e2e: true }, { ...DEFAULTS, only: 'e2e' }]) {
    const e2e = buildPlan(options, { e2eConfigured: false }).filter((s) => s.area === 'e2e');
    assert.equal(e2e.length, 1);
    assert.match(e2e[0].skip, /未設定: apps\/web に test:e2e と e2e\/ が必要/);
    assert.equal(e2e[0].command, undefined);
    assert.equal(e2e[0].special, undefined);
  }
  // 引数を省略した buildPlan は未設定として扱う
  const omitted = buildPlan({ ...DEFAULTS, only: 'e2e' }).filter((s) => s.area === 'e2e');
  assert.equal(omitted.length, 1);
  assert.ok(omitted[0].skip);
});

test('buildPlan: e2e が設定済みなら、インフラ起動・api 起動・test:e2e・停止の4段', () => {
  const plan = buildPlan({ ...DEFAULTS, only: 'e2e' }, { e2eConfigured: true });
  assert.equal(plan.length, 4);
  assert.deepEqual(plan[0].args, ['compose', '-f', 'docker/compose.yaml', 'up', '-d', '--wait']);
  assert.equal(plan[1].cwd, 'apps/api');
  assert.equal(plan[1].special, 'startApiAndWait');
  assert.equal(plan[2].command, 'pnpm');
  assert.deepEqual(plan[2].args, ['--filter', '@swv/web', 'run', 'test:e2e']);
  assert.equal(plan[3].special, 'stopApi');
  assert.ok(plan.every((s) => !s.skip));
});

test('buildPlan: --e2e で、設定済みなら実行の段が追加され、SKIP（未指定）の段は無くなる', () => {
  const plan = buildPlan({ ...DEFAULTS, e2e: true }, { e2eConfigured: true });
  assert.ok(plan.some((s) => s.area === 'e2e' && s.command === 'pnpm'));
  assert.ok(!plan.some((s) => s.area === 'e2e' && s.skip === '未指定'));
});

test('buildPlan: --sonar で sonar の実行の段が追加される（全体は scripts/sonar-local.sh を引数なしで呼ぶ）', () => {
  const plan = buildPlan({ ...DEFAULTS, sonar: true });
  const sonar = plan.filter((s) => s.area === 'sonar');
  assert.equal(sonar.length, 1);
  assert.equal(sonar[0].command, 'bash');
  assert.deepEqual(sonar[0].args, ['scripts/sonar-local.sh']);
  assert.equal(sonar[0].skip, undefined);
});

test('buildPlan: --only は指定領域だけに絞る（SKIP の段を足さない）', () => {
  for (const only of ['api', 'web', 'packages']) {
    const plan = buildPlan({ ...DEFAULTS, only });
    assert.ok(plan.length > 0);
    assert.ok(plan.every((s) => s.area === only), only);
    assert.ok(plan.every((s) => !s.skip), only);
  }
});

test('buildPlan: --sonar-area は領域の Sonar 解析の1段だけ', () => {
  for (const area of ['api', 'web', 'packages']) {
    const plan = buildPlan({ ...DEFAULTS, sonarArea: area });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].area, 'sonar');
    assert.equal(plan[0].name, `sonar-local.sh --area ${area}`);
    assert.equal(plan[0].command, 'bash');
    assert.deepEqual(plan[0].args, ['scripts/sonar-local.sh', '--area', area]);
  }
});

test('buildPlan: --sonar-area に --base を渡すと args に続く', () => {
  const plan = buildPlan({ ...DEFAULTS, sonarArea: 'api', base: 'origin/main' });
  assert.deepEqual(plan[0].args, ['scripts/sonar-local.sh', '--area', 'api', '--base', 'origin/main']);
});

test('buildPlan: api は2ステップで、contractTest に --rerun と classify がある（cwd は apps/api）', () => {
  const plan = buildPlan({ ...DEFAULTS, only: 'api' });
  assert.equal(plan.length, 2);
  assert.ok(plan.every((s) => s.cwd === 'apps/api'));
  assert.equal(plan[0].name, 'spotlessCheck / build');
  assert.deepEqual(plan[0].args, ['spotlessCheck', 'build', '--rerun-tasks', '--console=plain']);
  assert.equal(plan[1].name, 'contractTest');
  assert.deepEqual(plan[1].args, ['contractTest', '--rerun', '--console=plain']);
  assert.equal(plan[1].classify, 'contractTest');
});

test('buildPlan: web は @swv/web を --filter で絞り、cwd はリポジトリ直下（契約型の鮮度だけ apps/web）', () => {
  const plan = buildPlan({ ...DEFAULTS, only: 'web' });
  const scripts = ['lint:check', 'format:check', 'type-check', 'test:unit', 'build'];
  for (const script of scripts) {
    const step = plan.find((s) => s.name === script);
    assert.ok(step, script);
    assert.equal(step.cwd, '.');
    assert.deepEqual(step.args, ['--filter', '@swv/web', 'run', script]);
  }
  const lint = plan.find((s) => s.name === 'contract:lint');
  assert.deepEqual(lint.args, ['contract:lint']);
  const fresh = plan.filter((s) => s.special === 'schemaFreshness');
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].cwd, 'apps/web');
  assert.equal(fresh[0].name, 'contract:types フレッシュネス（一時生成と比較）');
});

test('buildPlan: web に git diff のステップは無く、契約の順序は ci.yml と同じ（lint → 鮮度 → docs → swagger）', () => {
  const plan = buildPlan({ ...DEFAULTS, only: 'web' });
  assert.ok(plan.every((s) => s.command !== 'git'));
  assert.ok(plan.every((s) => s.name !== 'contract:types'));
  const names = plan.map((s) => s.name);
  const fresh = 'contract:types フレッシュネス（一時生成と比較）';
  assert.ok(names.indexOf('contract:lint') < names.indexOf(fresh));
  assert.ok(names.indexOf(fresh) < names.indexOf('contract:docs'));
  assert.ok(names.indexOf('contract:docs') < names.indexOf('contract:swagger'));
});

test('buildPlan: packages は全パッケージを --filter で絞り、lint・format・type-check・test:unit だけ', () => {
  const plan = buildPlan({ ...DEFAULTS, only: 'packages' });
  assert.deepEqual(
    plan.map((s) => s.args),
    ['lint:check', 'format:check', 'type-check', 'test:unit'].map((s) => ['--filter', './packages/*', 'run', s]),
  );
  assert.ok(plan.every((s) => s.cwd === '.'));
});

// --- draft ---

test('classifyContractTest: PASS はそのまま（draft が残っていれば回収前の注記）', () => {
  assert.deepEqual(classifyContractTest({ status: 'PASS', draftMarkers: [], allowDraft: false }), { status: 'PASS', note: '' });
  const r = classifyContractTest({ status: 'PASS', draftMarkers: ['contracts/a.yaml:3'], allowDraft: false });
  assert.equal(r.status, 'PASS');
  assert.match(r.note, /draft 残存 1 件（回収前）/);
});

test('classifyContractTest: FAIL かつ draft 0件は FAIL（注記なし）', () => {
  for (const allowDraft of [false, true]) {
    assert.deepEqual(classifyContractTest({ status: 'FAIL', draftMarkers: [], allowDraft }), { status: 'FAIL', note: '' });
  }
});

test('classifyContractTest: FAIL・draft あり・allowDraft は XFAIL', () => {
  const r = classifyContractTest({ status: 'FAIL', draftMarkers: ['contracts/a.yaml:3'], allowDraft: true });
  assert.equal(r.status, 'XFAIL');
  assert.match(r.note, /想定内: draft 残存中の contractTest 失敗/);
  assert.match(r.note, /--allow-draft なしで再実行/);
});

test('classifyContractTest: FAIL・draft あり・allowDraft なしは FAIL（draft 起因の注記）', () => {
  const r = classifyContractTest({ status: 'FAIL', draftMarkers: ['a:1', 'b:2'], allowDraft: false });
  assert.equal(r.status, 'FAIL');
  assert.match(r.note, /draft 残存 2 件あり/);
  assert.match(r.note, /draft 起因の可能性/);
});

test('scanDraftMarkers: x-swv-status: draft の残存を file:line で検出する（素通りでない）', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'verify-draft-'));
  mkdirSync(path.join(dir, 'paths'));
  writeFileSync(path.join(dir, 'paths', 'a.yaml'), 'get:\n  summary: x\n  x-swv-status: draft\n');
  writeFileSync(path.join(dir, 'paths', 'b.yaml'), 'get:\n  summary: y\n');
  const hits = scanDraftMarkers(dir);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /a\.yaml:3$/);
  // 旧マーカー名や、行の途中に現れる文字列は検出しない
  writeFileSync(path.join(dir, 'paths', 'c.yaml'), 'description: x-swv-status: draft を回収する\n');
  assert.equal(scanDraftMarkers(dir).length, 1);
  assert.deepEqual(scanDraftMarkers(path.join(dir, 'none')), []);
});

// --- Sonar ---

test('extractSonarCounts: sonar-local.sh の出力例から件数と Quality Gate を取る', () => {
  const out = [
    'S1192\tapps/api/src/main/java/X.java:10\tmessage',
    '',
    '--- ルール別件数 ---',
    '1\tS1192',
    '',
    'カバレッジ（参考値・ゲートではない）: 全体 80% / 行 81% / 分岐 70%',
    'Quality Gate: ERROR（新規コードのカバレッジ 60% / 基準 80%以上。正式基準。design/tech-stack.md 参照）',
    '未解決: issue 3 件 / 未レビュー hotspot 2 件（詳細: .sonar-local/issues.json、画面: http://localhost:9000/dashboard?id=swv）',
  ].join('\n');
  assert.deepEqual(extractSonarCounts(out), { issues: 3, hotspots: 2, qualityGate: 'ERROR' });
});

test('extractSonarCounts: 件数行が無ければ null', () => {
  assert.equal(extractSonarCounts('エラー: SonarQube が起動しませんでした'), null);
  assert.equal(extractSonarCounts(''), null);
});

test('extractSonarCounts: Quality Gate 行が無ければ qualityGate: null（領域モードの出力）', () => {
  const out = '未解決: issue 0 件 / 未レビュー hotspot 0 件（領域: api・新規コードのみ。詳細: .sonar-local/issues-api.json）';
  assert.deepEqual(extractSonarCounts(out), { issues: 0, hotspots: 0, qualityGate: null });
});

test('scripts/sonar-local.sh の実物: 件数行の文言を extractSonarCounts が読める（領域モード・全体モードとも）', () => {
  const src = readFileSync(SONAR_SH, 'utf8');
  const countLines = src.split('\n').filter((l) => l.includes('未解決: issue'));
  assert.ok(countLines.length >= 3, `件数行が ${countLines.length} 件しか見つからない（領域モードの0件・領域モード・全体モードの3つが要る）`);
  for (const line of countLines) {
    const sample = line.slice(line.indexOf('未解決:')).replace(/\$\{[^}]*\}/g, '4');
    const counts = extractSonarCounts(sample);
    assert.ok(counts, `extractSonarCounts が読めない件数行: ${line.trim()}`);
    assert.equal(typeof counts.issues, 'number');
    assert.equal(typeof counts.hotspots, 'number');
  }
});

test('scripts/sonar-local.sh の実物: Quality Gate の行は全体モードにだけあり、extractSonarCounts が読める', () => {
  const src = readFileSync(SONAR_SH, 'utf8');
  const gateLines = src.split('\n').filter((l) => /Quality Gate: \$\{/.test(l));
  assert.equal(gateLines.length, 1, 'Quality Gate を出す行は全体モードの1か所だけのはず');
  const areaEnd = src.indexOf('\n  exit $?\nfi');
  assert.ok(areaEnd > 0, '領域モードの終わり（exit $?）が見つからない');
  assert.ok(src.indexOf('Quality Gate: ${') > areaEnd, '領域モードが Quality Gate を出している');
  const sample = gateLines[0].slice(gateLines[0].indexOf('Quality Gate:')).replace(/\$\{gate\.status\}/g, 'OK').replace(/\$\{[^}]*\}/g, '4');
  const out = `${sample}\n未解決: issue 0 件 / 未レビュー hotspot 0 件`;
  assert.equal(extractSonarCounts(out).qualityGate, 'OK');
});

// --- 契約型の鮮度 ---

test('judgeFreshness: バイト一致は PASS', () => {
  assert.equal(judgeFreshness(Buffer.from('abc'), Buffer.from('abc')).status, 'PASS');
});

test('judgeFreshness: 不一致は FAIL と再生成の指示（素通りでない）', () => {
  const r = judgeFreshness(Buffer.from('abc'), Buffer.from('abd'));
  assert.equal(r.status, 'FAIL');
  assert.match(r.reason, /pnpm contract:types/);
  assert.match(r.reason, /再生成した結果と一致しない/);
});

test('judgeFreshness: schema.ts が無ければ FAIL', () => {
  assert.equal(judgeFreshness(null, Buffer.from('abc')).status, 'FAIL');
});

// --- e2e の設定の検出 ---

function makeWebRoot({ script, dir }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'verify-e2e-'));
  mkdirSync(path.join(root, 'apps/web'), { recursive: true });
  const scripts = script ? { 'test:e2e': 'playwright test' } : { 'test:unit': 'vitest run' };
  writeFileSync(path.join(root, 'apps/web/package.json'), JSON.stringify({ name: '@swv/web', scripts }));
  if (dir) mkdirSync(path.join(root, 'apps/web/e2e'));
  return root;
}

test('detectE2eConfigured: test:e2e と e2e/ の両方があるときだけ true', () => {
  assert.equal(detectE2eConfigured(makeWebRoot({ script: true, dir: true })), true);
  assert.equal(detectE2eConfigured(makeWebRoot({ script: true, dir: false })), false);
  assert.equal(detectE2eConfigured(makeWebRoot({ script: false, dir: true })), false);
  assert.equal(detectE2eConfigured(makeWebRoot({ script: false, dir: false })), false);
  assert.equal(detectE2eConfigured(mkdtempSync(path.join(os.tmpdir(), 'verify-e2e-empty-'))), false);
});

test('detectE2eConfigured: このリポジトリの現状を読める（未設定なら e2e の段は SKIP）', () => {
  const configured = detectE2eConfigured(REPO_ROOT);
  const e2e = buildPlan({ ...DEFAULTS, only: 'e2e' }, { e2eConfigured: configured });
  assert.equal(e2e.some((s) => s.skip), !configured);
});

// --- 表示と終了コード ---

test('formatSummary: PASS 行を含む', () => {
  const results = [{ name: 'build', status: 'PASS', seconds: 3, command: './gradlew', args: ['build'] }];
  const out = formatSummary(results, '/tmp/swv-verify/1');
  assert.match(out, /PASS\s+build\s+3s/);
  assert.match(out, /\/tmp\/swv-verify\/1/);
  assert.match(out, /総合結果: PASS$/);
});

test('formatSummary: FAIL 時は末尾を表示する', () => {
  const tail = Array.from({ length: 50 }, (_, i) => `line${i}`).join('\n');
  const results = [{ name: 'lint:check', status: 'FAIL', seconds: 1, command: 'pnpm', args: ['lint:check'], tail }];
  const out = formatSummary(results, '/tmp/swv-verify/2');
  assert.match(out, /FAIL\s+lint:check/);
  assert.ok(out.includes('line49'));
  assert.ok(!out.includes('line0\n'));
  assert.match(out, /総合結果: FAIL/);
});

test('formatSummary: SKIP（未設定・未指定）は理由を出し、総合結果は PASS になる', () => {
  const results = [
    { area: 'e2e', name: 'e2e', status: 'SKIP', seconds: 0, reason: '未設定: apps/web に test:e2e と e2e/ が必要' },
    { area: 'sonar', name: 'sonar', status: 'SKIP', seconds: 0, reason: '未指定' },
  ];
  const out = formatSummary(results, '/tmp/swv-verify/3');
  assert.match(out, /SKIP\s+e2e/);
  assert.match(out, /理由: 未設定: apps\/web に test:e2e と e2e\/ が必要/);
  assert.match(out, /理由: 未指定/);
  assert.match(out, /総合結果: PASS$/);
});

test('formatSummary: 前提不足（PREREQ）は理由を出し、総合結果は前提不足になる', () => {
  const results = [{ area: 'api', name: 'spotlessCheck / build', status: 'PREREQ', seconds: 0, reason: '前提コマンドが見つかりません: java' }];
  const out = formatSummary(results, '/tmp/swv-verify/3');
  assert.match(out, /PREREQ\s+spotlessCheck/);
  assert.match(out, /前提コマンドが見つかりません: java/);
  assert.match(out, /総合結果: 前提不足/);
});

test('sonarCountsLine / formatSummary: sonar のステップは PASS・FAIL・SKIP のどれでも件数行を出す', () => {
  const base = { area: 'sonar', name: 'sonar-local.sh', seconds: 5, command: 'bash', args: ['scripts/sonar-local.sh'] };
  const pass = formatSummary([{ ...base, status: 'PASS', sonarCounts: { issues: 0, hotspots: 0, qualityGate: 'OK' } }], '/tmp/l');
  assert.match(pass, /Sonar 件数: issue 0 \/ hotspot 0 \/ Quality Gate OK/);
  const fail = formatSummary(
    [{ ...base, status: 'FAIL', tail: 'x', sonarCounts: { issues: 4, hotspots: 1, qualityGate: 'ERROR' } }],
    '/tmp/l',
  );
  assert.match(fail, /Sonar 件数: issue 4 \/ hotspot 1 \/ Quality Gate ERROR/);
  const noCounts = formatSummary([{ ...base, status: 'PASS', sonarCounts: null }], '/tmp/l');
  assert.match(noCounts, /Sonar 件数: 取得できず（sonar-local\.sh の出力に件数行が無い。全ログを確認）/);
  const skip = formatSummary([{ ...base, status: 'SKIP', seconds: 0, reason: '未指定' }], '/tmp/l');
  assert.match(skip, /Sonar 件数: 未取得（SKIP）/);
  assert.equal(sonarCountsLine({ ...base, status: 'SKIP' }), '  Sonar 件数: 未取得（SKIP）');
});

test('sonarCountsLine: 領域モード（--area 付き）は Quality Gate を出さず、件数行だけを出す', () => {
  const area = {
    area: 'sonar',
    name: 'sonar-local.sh --area api',
    seconds: 7,
    command: 'bash',
    args: ['scripts/sonar-local.sh', '--area', 'api'],
    status: 'PASS',
    sonarCounts: { issues: 0, hotspots: 0, qualityGate: null },
  };
  assert.equal(sonarCountsLine(area), '  Sonar 件数: issue 0 / hotspot 0');
  const out = formatSummary([area], '/tmp/l');
  assert.match(out, /PASS\s+sonar-local\.sh --area api/);
  assert.match(out, /Sonar 件数: issue 0 \/ hotspot 0$/m);
  assert.doesNotMatch(out, /Quality Gate/);
});

test('formatSummary: XFAIL と注記を出し、総合結果は想定内の失敗ありの PASS になる', () => {
  const results = [
    { area: 'api', name: 'spotlessCheck / build', status: 'PASS', seconds: 10, command: './gradlew', args: ['build'] },
    {
      area: 'api',
      name: 'contractTest',
      status: 'XFAIL',
      seconds: 4,
      command: './gradlew',
      args: ['contractTest'],
      note: '想定内: draft 残存中の contractTest 失敗。回収後に --allow-draft なしで再実行して PASS を確かめる',
    },
  ];
  const out = formatSummary(results, '/tmp/swv-verify/4');
  assert.match(out, /XFAIL\s+contractTest/);
  assert.match(out, / {2}注記: 想定内: draft 残存中の contractTest 失敗/);
  assert.match(out, /総合結果: PASS（想定内の失敗あり: XFAIL 1 件）/);
});

test('exitCodeOf: 全 PASS は 0', () => {
  assert.equal(exitCodeOf([{ status: 'PASS' }, { status: 'PASS' }]), 0);
});

test('exitCodeOf: FAIL があれば 1', () => {
  assert.equal(exitCodeOf([{ status: 'PASS' }, { status: 'FAIL' }]), 1);
});

test('exitCodeOf: SKIP（未設定・未指定）は 0 に数える', () => {
  assert.equal(exitCodeOf([{ status: 'PASS' }, { status: 'SKIP' }]), 0);
  assert.equal(exitCodeOf([{ status: 'SKIP' }]), 0);
});

test('exitCodeOf: 前提不足（PREREQ）は SKIP ではなく 2。FAIL があれば 1 が優先', () => {
  assert.equal(exitCodeOf([{ status: 'PASS' }, { status: 'PREREQ' }]), 2);
  assert.equal(exitCodeOf([{ status: 'PREREQ' }, { status: 'FAIL' }]), 1);
});

test('exitCodeOf: XFAIL は 0 に数える（FAIL・前提不足があればそちらが優先）', () => {
  assert.equal(exitCodeOf([{ status: 'PASS' }, { status: 'XFAIL' }]), 0);
  assert.equal(exitCodeOf([{ status: 'XFAIL' }, { status: 'FAIL' }]), 1);
  assert.equal(exitCodeOf([{ status: 'XFAIL' }, { status: 'PREREQ' }]), 2);
});

test('既定の計画（e2e・Sonar とも未指定）の結果は、実行する段がすべて PASS なら終了コード 0', () => {
  const plan = buildPlan({ ...DEFAULTS });
  const results = plan.map((s) => (s.skip ? { ...s, status: 'SKIP' } : { ...s, status: 'PASS' }));
  assert.equal(exitCodeOf(results), 0);
  assert.equal(results.filter((r) => r.status === 'SKIP').length, 2);
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decide, globToRegExp, loadScopes } from './agent-write-guard.mjs';
import {
  analyzeBashCommand,
  COMMAND_RULES,
  diffSnapshots,
  impliedCoverage,
  resolvePackageDirs,
  takeSnapshot,
} from './bash-write.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, 'agent-write-guard.mjs');
const SCOPES_PATH = path.join(__dirname, '../write-scopes.json');
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const scopes = loadScopes(SCOPES_PATH);
const ALL_ROLES = Object.keys(scopes.roles);

// テスト役の5役割（領域ごとに分かれている）と実装役の4役割。
const TEST_SCOPES = {
  'api-test-agent': 'apps/api/src/test/java/x/XTest.java',
  'web-test-agent': 'apps/web/src/test/x.spec.ts',
  'solver-test-agent': 'packages/solver/src/test/x.spec.ts',
  'data-test-agent': 'packages/data/src/test/x.spec.ts',
  'e2e-agent': 'apps/web/e2e/x.spec.ts',
};
const IMPL_SCOPES = {
  'api-agent': 'apps/api/src/main/java/x/X.java',
  'web-agent': 'apps/web/src/main/a.ts',
  'solver-agent': 'packages/solver/src/main/a.ts',
  'data-agent': 'packages/data/src/main/a.ts',
};
const TEST_ROLES = Object.keys(TEST_SCOPES);
const IMPL_ROLES = Object.keys(IMPL_SCOPES);
// 各ロールが書ける代表のパス（test-investigator は書けない）。
const OWN_PATHS = {
  ...IMPL_SCOPES,
  ...TEST_SCOPES,
  'contract-agent': 'contracts/paths/x.yaml',
  'data-model-agent': 'apps/api/src/main/resources/db/migration/V9__x.sql',
};

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'guard-fixture-'));
}

function baseParams(overrides = {}) {
  return {
    toolName: 'Write',
    toolInput: {},
    role: 'api-agent',
    root: fixtureRoot(),
    scopes,
    tmpdir: os.tmpdir(),
    platform: 'linux',
    realpath: (p) => p,
    ...overrides,
  };
}

function writeDecision(role, filePath, extra = {}) {
  return decide(baseParams({ role, toolInput: { file_path: filePath }, ...extra }));
}

// --- ロールごとの allow / deny ---

test('api-agent: main/java 配下と application*.yml は allow', () => {
  assert.equal(writeDecision('api-agent', 'apps/api/src/main/java/x/X.java').decision, 'allow');
  assert.equal(writeDecision('api-agent', 'apps/api/src/main/resources/application-local.yml').decision, 'allow');
});

test('api-agent: src/test・ビルド設定・migration は deny', () => {
  for (const p of [
    'apps/api/src/test/java/x/XTest.java',
    'apps/api/build.gradle.kts',
    'apps/api/src/main/resources/db/migration/V9__x.sql',
  ]) {
    assert.equal(writeDecision('api-agent', p).decision, 'deny', p);
  }
});

test('web-agent: schema.ts は allow、package.json・src/test は deny', () => {
  assert.equal(writeDecision('web-agent', 'apps/web/src/main/lib/api/schema.ts').decision, 'allow');
  assert.equal(writeDecision('web-agent', 'apps/web/package.json').decision, 'deny');
  assert.equal(writeDecision('web-agent', 'apps/web/src/test/x.spec.ts').decision, 'deny');
});

test('各ロール: 自分の領域のフォルダは allow', () => {
  for (const [role, p] of Object.entries(OWN_PATHS)) {
    assert.equal(writeDecision(role, p).decision, 'allow', `${role} / ${p}`);
  }
});

test('各ロール: ほかのロールの領域は deny（solver と data の相互・実装とテストの相互を含む）', () => {
  for (const [role] of Object.entries(OWN_PATHS)) {
    for (const [other, p] of Object.entries(OWN_PATHS)) {
      if (other === role) continue;
      assert.equal(writeDecision(role, p).decision, 'deny', `${role} が ${other} の領域 ${p} に書けてはならない`);
    }
  }
});

test('solver 系は packages/data/** へ、data 系は packages/solver/** へ書けない', () => {
  for (const role of ['solver-agent', 'solver-test-agent']) {
    for (const p of ['packages/data/src/main/a.ts', 'packages/data/src/test/a.spec.ts']) {
      assert.equal(writeDecision(role, p).decision, 'deny', `${role} / ${p}`);
    }
  }
  for (const role of ['data-agent', 'data-test-agent']) {
    for (const p of ['packages/solver/src/main/a.ts', 'packages/solver/src/test/a.spec.ts']) {
      assert.equal(writeDecision(role, p).decision, 'deny', `${role} / ${p}`);
    }
  }
});

test('テスト役は実装フォルダへ、実装役はテストフォルダへ書けない', () => {
  assert.equal(writeDecision('solver-test-agent', 'packages/solver/src/main/a.ts').decision, 'deny');
  assert.equal(writeDecision('data-test-agent', 'packages/data/src/main/a.ts').decision, 'deny');
  for (const role of TEST_ROLES) {
    for (const p of Object.values(IMPL_SCOPES)) {
      assert.equal(writeDecision(role, p).decision, 'deny', `${role} / ${p}`);
    }
  }
  for (const role of IMPL_ROLES) {
    for (const p of Object.values(TEST_SCOPES)) {
      assert.equal(writeDecision(role, p).decision, 'deny', `${role} / ${p}`);
    }
  }
});

test('実装役: 構成ファイル（package.json・vitest.config.ts など）は deny', () => {
  for (const role of IMPL_ROLES) {
    for (const p of [
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      'apps/web/package.json',
      'apps/web/vitest.config.ts',
      'apps/web/vite.config.ts',
      'packages/solver/package.json',
      'packages/data/tsconfig.json',
      'apps/api/gradle/libs.versions.toml',
      'docker/compose.yaml',
    ]) {
      assert.equal(writeDecision(role, p).decision, 'deny', `${role} / ${p}`);
    }
  }
});

test('packages/data/dist/** はどのロールも書けない', () => {
  for (const role of ALL_ROLES) {
    assert.equal(writeDecision(role, 'packages/data/dist/master.json').decision, 'deny', role);
  }
});

test('contract-agent: contracts 配下は allow', () => {
  assert.equal(writeDecision('contract-agent', 'contracts/paths/x.yaml').decision, 'allow');
});

test('data-model-agent: migration・data-model-standard.md・attributes.yaml は allow、ui-design-standard.md は deny', () => {
  for (const p of [
    'apps/api/src/main/resources/db/migration/V9__x.sql',
    'design/data-model-standard.md',
    'design/attributes.yaml',
  ]) {
    assert.equal(writeDecision('data-model-agent', p).decision, 'allow', p);
  }
  assert.equal(writeDecision('data-model-agent', 'design/ui-design-standard.md').decision, 'deny');
});

test('test-investigator: リポジトリ内への書込は Write/Edit/NotebookEdit とも deny', () => {
  const root = fixtureRoot();
  for (const toolName of ['Write', 'Edit', 'NotebookEdit']) {
    for (const p of [
      'apps/api/src/test/java/x/XTest.java',
      'apps/web/src/test/x.spec.ts',
      'packages/solver/src/test/x.spec.ts',
      'apps/web/e2e/x.spec.ts',
      'apps/api/src/main/java/x/X.java',
      'README.md',
    ]) {
      const r = decide(baseParams({ root, role: 'test-investigator', toolName, toolInput: { file_path: p } }));
      assert.equal(r.decision, 'deny', `${toolName} / ${p}`);
    }
  }
});

test('test-investigator: root 外の一時ディレクトリへの書込は allow', () => {
  const root = fixtureRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-scratch-'));
  const r = decide(
    baseParams({ root, role: 'test-investigator', tmpdir: os.tmpdir(), toolInput: { file_path: path.join(tmp, 'triage.log') } }),
  );
  assert.equal(r.decision, 'allow');
});

test('全ロール共通: specs/**・tasks/lessons.md・.claude/**・CLAUDE.md・README.md は deny', () => {
  for (const role of ALL_ROLES) {
    for (const p of ['specs/001-x/spec.md', 'tasks/lessons.md', '.claude/skills/x/SKILL.md', 'CLAUDE.md', 'README.md']) {
      assert.equal(writeDecision(role, p).decision, 'deny', `${role} / ${p}`);
    }
  }
});

// --- fail-closed ---

test('fail-closed: 未知のロールは deny', () => {
  assert.equal(writeDecision('unknown-role', 'apps/api/src/main/java/X.java').decision, 'deny');
});

test('fail-closed: 許可表に無い役割名は、領域の語を含んでいても deny', () => {
  assert.equal(writeDecision('ghost-test-agent', 'apps/api/src/test/java/X.java').decision, 'deny');
});

test('fail-closed: ロール引数なしは deny', () => {
  assert.equal(writeDecision(undefined, 'apps/api/src/main/java/X.java').decision, 'deny');
});

test('fail-closed: file_path なしは deny', () => {
  const r = decide(baseParams({ toolInput: {} }));
  assert.equal(r.decision, 'deny');
});

test('fail-closed: write-scopes.json が壊れている（scopes 未定義）は deny', () => {
  const r = decide(baseParams({ scopes: null, toolInput: { file_path: 'apps/api/src/main/java/X.java' } }));
  assert.equal(r.decision, 'deny');
});

test('fail-closed: 判定中に例外が出たら deny', () => {
  const bad = decide({
    toolName: 'Write',
    toolInput: {
      file_path: {
        toString: () => {
          throw new Error('boom');
        },
      },
    },
    role: 'api-agent',
    root: fixtureRoot(),
    scopes,
    tmpdir: os.tmpdir(),
    platform: 'linux',
    realpath: (p) => p,
  });
  assert.equal(bad.decision, 'deny');
  assert.ok(bad.reason.includes('内部エラー'), bad.reason);
});

// --- パス正規化 ---

test('パス正規化: .. を含むパスで許可外へ脱出しようとすると deny', () => {
  assert.equal(writeDecision('api-agent', 'apps/api/src/main/java/../../../build.gradle.kts').decision, 'deny');
});

test('root の外へ出る相対パスは deny', () => {
  // root は一時ディレクトリ配下に作られるため、tmpdir を無関係な値にして一時ディレクトリの許可と切り離す。
  const r = writeDecision('api-agent', '../outside.txt', { tmpdir: path.join(path.parse(os.tmpdir()).root, 'guard-no-such-tmpdir') });
  assert.equal(r.decision, 'deny');
});

test('Windows 形式の区切り文字を含むパスも判定できる', () => {
  const r = writeDecision('api-agent', 'apps\\api\\src\\main\\java\\x\\X.java', { platform: 'win32' });
  assert.equal(r.decision, 'allow');
});

test('絶対パス指定でも root 基準で判定できる', () => {
  const root = fixtureRoot();
  const abs = path.join(root, 'apps/api/src/main/java/x/X.java');
  const r = decide(baseParams({ root, toolInput: { file_path: abs } }));
  assert.equal(r.decision, 'allow');
});

test('root 外の一時ディレクトリは allow', () => {
  const root = fixtureRoot();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-scratch-'));
  const target = path.join(tmp, 'scratch.txt');
  const r = decide(baseParams({ root, tmpdir: os.tmpdir(), toolInput: { file_path: target } }));
  assert.equal(r.decision, 'allow');
});

test('root 外の一時ディレクトリ以外（ホーム配下等）は deny', () => {
  const root = fixtureRoot();
  const outside = path.join(os.homedir(), 'not-a-tmp-dir', 'x.txt');
  const r = decide(baseParams({ root, tmpdir: os.tmpdir(), toolInput: { file_path: outside } }));
  assert.equal(r.decision, 'deny');
});

// --- 対象外ツール ---

test('Read・Grep は allow（出力なし）', () => {
  for (const toolName of ['Read', 'Grep']) {
    const r = decide(baseParams({ toolName, toolInput: { file_path: 'apps/api/build.gradle.kts' } }));
    assert.equal(r.decision, 'allow');
    assert.equal(r.reason, '');
  }
});

// --- glob 照合 ---

test('globToRegExp: ** は 0個以上のディレクトリに一致する', () => {
  const re = globToRegExp('apps/api/src/main/java/**');
  assert.ok(re.test('apps/api/src/main/java/X.java'));
  assert.ok(re.test('apps/api/src/main/java/x/y/X.java'));
  assert.ok(!re.test('apps/api/src/test/java/X.java'));
});

test('globToRegExp: * は / を含まない', () => {
  const re = globToRegExp('apps/api/src/main/resources/application*.yml');
  assert.ok(re.test('apps/api/src/main/resources/application-local.yml'));
  assert.ok(!re.test('apps/api/src/main/resources/db/application.yml'));
});

// --- Bash: 事前判定（decide） ---

// root と一時ディレクトリを分けた砂場（root 外の相対パスが os.tmpdir() に当たって allow にならないようにする）。
function makeSandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-sbx-'));
  const root = path.join(base, 'repo');
  const tmpdir = path.join(base, 'tmp');
  fs.mkdirSync(root);
  fs.mkdirSync(tmpdir);
  return { base, root, tmpdir };
}
const SB = makeSandbox();

function bashDecide(command, role, extra = {}) {
  return decide({
    toolName: 'Bash',
    toolInput: { command },
    role,
    root: SB.root,
    scopes,
    tmpdir: SB.tmpdir,
    platform: 'linux',
    realpath: (p) => p,
    ...extra,
  });
}

// allow に挙げたロールは allow、deny に挙げたロールは deny になること。
function assertBashRoles(command, { allow = [], deny = [] }) {
  for (const role of allow) {
    const r = bashDecide(command, role);
    assert.equal(r.decision, 'allow', `${role} は allow のはず: ${command} / ${r.reason}`);
    assert.equal(r.reason, '');
  }
  for (const role of deny) {
    const r = bashDecide(command, role);
    assert.equal(r.decision, 'deny', `${role} は deny のはず: ${command}`);
  }
}

const others = (...except) => ALL_ROLES.filter((r) => !except.includes(r));

test('Bash: heredoc で api の許可フォルダへ書く（api-agent だけ allow）', () => {
  const cmd = "cat > apps/api/src/main/java/x/X.java <<'EOF'\npackage x;\nEOF";
  assertBashRoles(cmd, { allow: ['api-agent'], deny: others('api-agent') });
});

test('Bash: heredoc の本文に別フォルダのパス文字列があっても、判定は書込先で決まる', () => {
  const cmd = "cat > apps/api/src/main/java/x/X.java <<'EOF'\n// mentions apps/web/src/main/a.ts\nEOF";
  assertBashRoles(cmd, { allow: ['api-agent'], deny: ['web-agent'] });
});

test('Bash: 台帳への追記は全ロール deny', () => {
  assertBashRoles('echo x >> tasks/lessons.md', { deny: ALL_ROLES });
});

test('Bash: sed -i でビルド設定を書換えるのは全ロール deny', () => {
  assertBashRoles("sed -i 's/a/b/' apps/api/build.gradle.kts", { deny: ALL_ROLES });
  assertBashRoles("sed -i 's/a/b/' package.json", { deny: ALL_ROLES });
});

test('Bash: リダイレクトの書込先で判定する（solver 系が packages/data へ書くのは deny）', () => {
  assertBashRoles('echo x > packages/data/src/main/a.ts', { allow: ['data-agent'], deny: others('data-agent') });
  assertBashRoles('echo x > packages/solver/src/main/a.ts', { allow: ['solver-agent'], deny: others('solver-agent') });
  assertBashRoles('echo x > packages/data/dist/master.json', { deny: ALL_ROLES });
});

test('Bash: tee の書込先で判定する（web-agent allow）', () => {
  assertBashRoles('tee apps/web/src/main/a.ts', { allow: ['web-agent'], deny: others('web-agent') });
  assertBashRoles('tee packages/solver/src/test/a.spec.ts', {
    allow: ['solver-test-agent'],
    deny: others('solver-test-agent'),
  });
});

test('Bash: cp の最後の引数が書込先（api-test-agent allow・ほかは deny）', () => {
  assertBashRoles('cp a apps/api/src/test/java/X.java', { allow: ['api-test-agent'], deny: others('api-test-agent') });
});

test('Bash: cd apps/web && pnpm exec prettier --write（web-agent allow・テスト役 deny）', () => {
  assertBashRoles('cd apps/web && pnpm exec prettier --write src/main/a.vue', {
    allow: ['web-agent'],
    deny: TEST_ROLES,
  });
});

test('Bash: テスト役が自分の領域のファイルを prettier で整形するのは allow', () => {
  assertBashRoles('cd apps/web && pnpm exec prettier --write src/test/a.spec.ts', {
    allow: ['web-test-agent'],
    deny: ['web-agent', 'e2e-agent', 'api-test-agent'],
  });
  assertBashRoles('cd packages/data && pnpm exec prettier --write src/test/a.spec.ts', {
    allow: ['data-test-agent'],
    deny: ['data-agent', 'solver-test-agent'],
  });
});

test('Bash: gradlew spotlessApply は apps/api/src/ への暗黙の書込（重なるロールだけ通す）', () => {
  assertBashRoles('./gradlew spotlessApply', {
    // data-model-agent の migration フォルダも apps/api/src/ の内側なので重なる（実際の変化は事後照合に委ねる）。
    allow: ['api-agent', 'api-test-agent', 'data-model-agent'],
    deny: ['web-agent', 'contract-agent', 'web-test-agent', 'e2e-agent', 'solver-agent', 'solver-test-agent', 'data-agent', 'data-test-agent', 'test-investigator'],
  });
});

test('Bash: spotlessApply に -PspotlessIdeHook があればそのファイルだけが書込先', () => {
  const cmd = `./gradlew spotlessApply -PspotlessIdeHook=${path.join(SB.root, 'apps/api/src/test/java/X.java')}`;
  assertBashRoles(cmd, { allow: ['api-test-agent'], deny: ['api-agent'] });
});

test('Bash: pnpm format は各パッケージの src/ への暗黙の書込（部分重複は通す）', () => {
  assertBashRoles('pnpm format', {
    allow: ['web-agent', 'web-test-agent', 'solver-agent', 'solver-test-agent', 'data-agent', 'data-test-agent'],
    deny: ['api-agent', 'api-test-agent', 'contract-agent', 'data-model-agent', 'e2e-agent', 'test-investigator'],
  });
  assertBashRoles('pnpm -r run format', {
    allow: ['web-agent', 'solver-agent', 'data-agent'],
    deny: ['api-agent', 'e2e-agent'],
  });
});

test('Bash: pnpm --filter <selector> run format は selector が指すパッケージの src/ だけが書込先', () => {
  assertBashRoles('pnpm --filter @swv/data run format', {
    allow: ['data-agent', 'data-test-agent'],
    deny: ['web-agent', 'web-test-agent', 'solver-agent', 'solver-test-agent', 'api-agent', 'e2e-agent', 'contract-agent'],
  });
  assertBashRoles('pnpm --filter @swv/solver run format', {
    allow: ['solver-agent', 'solver-test-agent'],
    deny: ['data-agent', 'data-test-agent', 'web-agent'],
  });
  assertBashRoles('pnpm --filter @swv/web run format', {
    allow: ['web-agent', 'web-test-agent'],
    deny: ['solver-agent', 'data-agent', 'e2e-agent'],
  });
  assertBashRoles("pnpm --filter './packages/*' run format", {
    allow: ['solver-agent', 'solver-test-agent', 'data-agent', 'data-test-agent'],
    deny: ['web-agent', 'web-test-agent', 'api-agent', 'e2e-agent'],
  });
});

test('Bash: 解決できない selector は全パッケージとみなす（担当外の役割は deny のまま）', () => {
  assertBashRoles('pnpm --filter @swv/unknown run format', {
    allow: ['web-agent', 'solver-agent', 'data-agent'],
    deny: ['api-agent', 'e2e-agent', 'contract-agent'],
  });
});

test('Bash: pnpm の cwd がパッケージ内なら、そのパッケージだけが対象', () => {
  assertBashRoles('cd packages/data && pnpm run format', {
    allow: ['data-agent', 'data-test-agent'],
    deny: ['solver-agent', 'solver-test-agent', 'web-agent'],
  });
});

test('Bash: pnpm lint はパッケージ全体への暗黙の書込（selector で絞れる）', () => {
  assertBashRoles('pnpm --filter @swv/data run lint', {
    allow: ['data-agent', 'data-test-agent'],
    deny: ['solver-agent', 'web-agent', 'api-agent'],
  });
});

test('Bash: 暗黙の書込先は同じコマンドの接頭辞がすべて none のときだけ deny', () => {
  const partialScopes = { version: 1, roles: { 'x-agent': ['packages/data/src/test/**'] } };
  const noneScopes = { version: 1, roles: { 'y-agent': ['contracts/**'] } };
  const ok = bashDecide('pnpm format', 'x-agent', { scopes: partialScopes });
  assert.equal(ok.decision, 'allow', ok.reason);
  const ng = bashDecide('pnpm format', 'y-agent', { scopes: noneScopes });
  assert.equal(ng.decision, 'deny');
});

test('Bash: pnpm contract:types は schema.ts への書込（web-agent allow・ほかは deny）', () => {
  assertBashRoles('pnpm contract:types', { allow: ['web-agent'], deny: ['api-agent', 'solver-agent', 'data-agent'] });
  assertBashRoles('pnpm --filter @swv/web run contract:types', { allow: ['web-agent'], deny: ['api-agent'] });
});

test('Bash: 依存の追加・更新は全ロール deny', () => {
  assertBashRoles('pnpm add lodash', { deny: ALL_ROLES });
  assertBashRoles('pnpm --filter @swv/web add lodash', { deny: ALL_ROLES });
  assertBashRoles('pnpm install --frozen-lockfile', { deny: ALL_ROLES });
});

test('Bash: インライン実行のファイル書込は deny、書込 API が無ければ allow', () => {
  assertBashRoles(`python3 -c "open('x','w').write('y')"`, { deny: ALL_ROLES });
  assertBashRoles(`node -e "require('fs').writeFileSync('x','y')"`, { deny: ALL_ROLES });
  assertBashRoles('node -e "console.log(1)"', { allow: ALL_ROLES });
});

test('Bash: 書込の無いコマンドと /dev/null へのリダイレクトは allow', () => {
  assertBashRoles('./gradlew build --rerun-tasks > /dev/null 2>&1', { allow: ALL_ROLES });
  assertBashRoles('grep -r foo apps/api/src/main', { allow: ALL_ROLES });
  assertBashRoles('pnpm --filter @swv/data run test:unit', { allow: ALL_ROLES });
});

test('Bash: git stash は deny、list は allow', () => {
  assertBashRoles('git stash', { deny: ALL_ROLES });
  assertBashRoles('git stash push', { deny: ALL_ROLES });
  assertBashRoles('git stash list', { allow: ALL_ROLES });
});

test('Bash: 禁止コマンドの deny 理由は禁止コマンドと分かる', () => {
  const r = bashDecide('git checkout main', 'api-agent');
  assert.equal(r.decision, 'deny');
  assert.ok(r.reason.includes('禁止コマンド'), r.reason);
});

test('Bash: 書込先を特定できない deny 理由は Write/Edit を案内する', () => {
  const r = bashDecide('echo x > "$OUT"', 'api-agent');
  assert.equal(r.decision, 'deny');
  assert.ok(r.reason.includes('Write/Edit'), r.reason);
});

test('Bash: git restore はパスが書込先（api-agent allow・テスト役 deny）', () => {
  assertBashRoles('git restore apps/api/src/main/java/X.java', { allow: ['api-agent'], deny: TEST_ROLES });
});

test('Bash: 変数を含む書込先は全ロール deny', () => {
  assertBashRoles('echo x > "$OUT"', { deny: ALL_ROLES });
});

test('Bash: bash -c の文字列を再帰的に解析する（contract-agent allow・api-agent deny）', () => {
  assertBashRoles('bash -c "echo x > contracts/a.yaml"', { allow: ['contract-agent'], deny: ['api-agent'] });
});

test('Bash: chmod・chown の先頭引数（モード・所有者）は書込先に含めない', () => {
  assertBashRoles('chmod 755 apps/api/src/main/java/X.java', { allow: ['api-agent'], deny: TEST_ROLES });
  assertBashRoles('chown user:grp apps/api/src/main/java/X.java', { allow: ['api-agent'] });
});

// --- Bash: 読み取りだけのコマンドの誤検知を減らす（allow）と、故意の違反の注入（deny） ---

test('Bash（読み取りのみ）: xargs の後ろが読み取りコマンドなら全ロール allow', () => {
  assertBashRoles('git diff --name-only | xargs grep -n foo', { allow: ALL_ROLES });
  assertBashRoles('git ls-files | xargs wc -l', { allow: ALL_ROLES });
  assertBashRoles('git ls-files | xargs cat', { allow: ALL_ROLES });
  assertBashRoles('git ls-files | xargs head -n 5', { allow: ALL_ROLES });
  assertBashRoles('git ls-files | xargs ls -l', { allow: ALL_ROLES });
});

test('Bash（読み取りのみ）: xargs のリンタ・フォーマッタは、書込フラグが無ければ allow', () => {
  assertBashRoles('git ls-files apps/web/src | xargs oxlint', { allow: ALL_ROLES });
  assertBashRoles('git ls-files apps/web/src | xargs eslint', { allow: ALL_ROLES });
  assertBashRoles('git ls-files apps/web/src | xargs prettier --check', { allow: ALL_ROLES });
});

test('Bash（読み取りのみ）: xargs sh -c の文字列に書込が無ければ allow', () => {
  assertBashRoles("ls apps/web/src/test | xargs -I{} sh -c 'grep -c it {}'", { allow: ALL_ROLES });
  assertBashRoles("ls apps/web/src/test | xargs -I{} bash -c 'cat {} | wc -l'", { allow: ALL_ROLES });
});

test('Bash（読み取りのみ）: find -exec sh -c の文字列に書込が無ければ allow', () => {
  assertBashRoles("find apps/web/src -name '*.ts' -exec sh -c 'grep -c it \"$0\"' {} \\;", { allow: ALL_ROLES });
});

test('Bash（読み取りのみ）: 読み取りコマンドの引数だけが変数・コマンド置換なら allow', () => {
  assertBashRoles('F=src/x.ts; cat "$F"', { allow: ALL_ROLES });
  assertBashRoles('cd apps/web && pnpm exec oxlint $FILES', { allow: ALL_ROLES });
  assertBashRoles('grep -rn "$(git rev-parse HEAD)" apps/api/src/main', { allow: ALL_ROLES });
});

test('Bash（読み取りのみ）: 一時ディレクトリへのリダイレクトは、書込先が静的に分かれば allow', () => {
  assertBashRoles(`pnpm exec vitest run src/test/a.spec.ts > ${path.join(SB.tmpdir, 'v.log')} 2>&1`, { allow: ALL_ROLES });
});

test('Bash（違反の注入）: 書込先に変数を含むリダイレクトは、一時ディレクトリ変数でも deny のまま', () => {
  assertBashRoles('pnpm exec vitest run src/test/a.spec.ts > "$TMPDIR/v.log"', { deny: ALL_ROLES });
});

test('Bash（違反の注入）: xargs sh -c の文字列が許可外へ書くなら deny', () => {
  assertBashRoles("xargs sh -c 'echo x > apps/api/src/main/X.java'", { deny: ALL_ROLES });
  assertBashRoles("ls | xargs -I{} sh -c 'echo x > {}'", { deny: ALL_ROLES });
  assertBashRoles("ls | xargs -I{} bash -c 'rm {}'", { deny: ALL_ROLES });
});

test('Bash（違反の注入）: find -exec sh -c の文字列が書込を含むなら deny', () => {
  assertBashRoles("find . -name '*.tmp' -exec sh -c 'rm \"$0\"' {} \\;", { deny: ALL_ROLES });
  assertBashRoles("find . -name '*.ts' -exec sh -c 'echo x >> tasks/lessons.md' \\;", { deny: ALL_ROLES });
});

test('Bash（違反の注入）: xargs の書込コマンド・文字列を特定できない sh は deny', () => {
  assertBashRoles('ls | xargs rm', { deny: ALL_ROLES });
  assertBashRoles('ls | xargs sh', { deny: ALL_ROLES });
  assertBashRoles('ls | xargs sh -c "$CMD"', { deny: ALL_ROLES });
});

test('Bash（違反の注入）: 変数の書込先は deny', () => {
  assertBashRoles('echo x > "$OUT"', { deny: ALL_ROLES });
  assertBashRoles('echo x >> "$(pwd)/a.txt"', { deny: ALL_ROLES });
});

test('Bash（違反の注入）: インタプリタの heredoc に書込 API があれば deny、無ければ allow', () => {
  assertBashRoles("python3 - <<'EOF'\nopen('x','w').write('y')\nEOF", { deny: ALL_ROLES });
  assertBashRoles("python3 - <<'EOF'\nprint(1)\nEOF", { allow: ALL_ROLES });
});

test('Bash（違反の注入）: 各役割は許可外へ書く Bash を deny される', () => {
  const outside = {
    'contract-agent': 'apps/api/src/main/java/X.java',
    'api-agent': 'apps/api/src/test/java/X.java',
    'web-agent': 'apps/web/src/test/x.spec.ts',
    'api-test-agent': 'apps/api/src/main/java/X.java',
    'web-test-agent': 'apps/web/src/main/a.ts',
    'e2e-agent': 'apps/web/src/test/x.spec.ts',
    'data-model-agent': 'design/ui-design-standard.md',
    'solver-agent': 'packages/data/src/main/a.ts',
    'solver-test-agent': 'packages/solver/src/main/a.ts',
    'data-agent': 'packages/solver/src/main/a.ts',
    'data-test-agent': 'packages/data/src/main/a.ts',
    'test-investigator': 'apps/api/src/test/java/X.java',
  };
  assert.deepEqual(Object.keys(outside).sort(), ALL_ROLES.slice().sort());
  for (const [role, p] of Object.entries(outside)) {
    const r = bashDecide(`echo x > ${p}`, role);
    assert.equal(r.decision, 'deny', `${role} が ${p} へ書けてはならない`);
  }
});

test('Bash（違反の注入）: test-investigator はリポジトリ内へ書けず、一時ディレクトリへは書ける', () => {
  assertBashRoles('echo x > apps/api/src/test/java/X.java', { deny: ['test-investigator'] });
  assertBashRoles('tee apps/web/src/test/x.spec.ts', { deny: ['test-investigator'] });
  assertBashRoles(`echo x > ${path.join(SB.tmpdir, 'triage.log')}`, { allow: ['test-investigator'] });
  assertBashRoles('pnpm exec vitest run src/test/a.spec.ts', { allow: ['test-investigator'] });
});

test('Bash fail-closed: command が欠落・非文字列なら deny', () => {
  for (const toolInput of [{}, null, undefined, { command: 123 }, { command: ['echo'] }]) {
    const r = decide({
      toolName: 'Bash',
      toolInput,
      role: 'api-agent',
      root: SB.root,
      scopes,
      tmpdir: SB.tmpdir,
      platform: 'linux',
      realpath: (p) => p,
    });
    assert.equal(r.decision, 'deny', JSON.stringify(toolInput));
  }
});

test('Bash fail-closed: 閉じていないクォートは deny', () => {
  assertBashRoles("echo 'abc > apps/api/src/main/java/X.java", { deny: ALL_ROLES });
  assertBashRoles('echo "abc', { deny: ALL_ROLES });
});

test('Bash fail-closed: 未知のロールは Bash でも deny', () => {
  const r = bashDecide('echo x > apps/api/src/main/java/X.java', 'unknown-role');
  assert.equal(r.decision, 'deny');
});

test('Bash パス正規化: root の外へ出る相対パスは deny', () => {
  assertBashRoles('echo x > ../outside.txt', { deny: ['api-agent'] });
});

test('Bash パス正規化: root 外の一時ディレクトリは allow', () => {
  assertBashRoles(`echo x > ${path.join(SB.tmpdir, 'a')}`, { allow: ['api-agent'] });
});

test('Bash パス正規化: root 配下の絶対パスは許可フォルダ内なら allow・外なら deny', () => {
  assertBashRoles(`echo x > ${path.join(SB.root, 'apps/api/src/main/java/X.java')}`, { allow: ['api-agent'] });
  assertBashRoles(`echo x > ${path.join(SB.root, 'apps/api/src/test/java/X.java')}`, { deny: ['api-agent'] });
});

test('Bash パス正規化: 静的な cd を追跡する', () => {
  assertBashRoles('cd apps/api && echo x > src/main/java/X.java', { allow: ['api-agent'] });
  assertBashRoles('cd apps/api && echo x > src/test/java/X.java', { deny: ['api-agent'] });
});

test('Bash パス正規化: stdin の cwd を相対パスの基準にする', () => {
  const cwd = path.join(SB.root, 'apps/api');
  const ok = bashDecide('echo x > src/main/java/X.java', 'api-agent', { cwd });
  assert.equal(ok.decision, 'allow', ok.reason);
  const ng = bashDecide('echo x > src/test/java/X.java', 'api-agent', { cwd });
  assert.equal(ng.decision, 'deny');
});

// --- bash-write.mjs の単体 ---

const paths = (res) => res.writes.map((w) => w.path);
const prefixes = (res) => res.implied.map((i) => i.prefix);

test('bash-write: 書込の無いコマンドは空の結果を返す', () => {
  assert.deepEqual(analyzeBashCommand('echo hi'), { writes: [], implied: [], unanalyzable: [], forbidden: [] });
  for (const c of ['ls -la', './gradlew test', 'node scripts/x.mjs', 'find . -name x']) {
    const r = analyzeBashCommand(c);
    assert.deepEqual([r.writes, r.implied, r.unanalyzable, r.forbidden], [[], [], [], []], c);
  }
});

test('bash-write: COMMAND_RULES は表を公開している', () => {
  assert.deepEqual(COMMAND_RULES.pnpmScripts.format.impliedIn, ['src/']);
  assert.deepEqual(COMMAND_RULES.pnpmScripts['contract:types'].writes, ['apps/web/src/main/lib/api/schema.ts']);
  assert.deepEqual(COMMAND_RULES.workspace.packages, {
    '@swv/web': 'apps/web',
    '@swv/solver': 'packages/solver',
    '@swv/data': 'packages/data',
  });
  assert.ok(COMMAND_RULES.git.forbidden.includes('push'));
});

test('bash-write: COMMAND_RULES のパッケージは write-scopes.json の実装・テスト領域と対応する', () => {
  for (const dir of Object.values(COMMAND_RULES.workspace.packages)) {
    const covered = Object.values(scopes.roles)
      .flat()
      .some((g) => g.startsWith(`${dir}/src/`));
    assert.ok(covered, `${dir} の src/ を許可する役割が write-scopes.json に無い`);
  }
});

test('bash-write: resolvePackageDirs は名前・名前の glob・パスの glob を解き、解けなければ全パッケージ', () => {
  const all = ['apps/web', 'packages/solver', 'packages/data'];
  assert.deepEqual(resolvePackageDirs([]), all);
  assert.deepEqual(resolvePackageDirs(['@swv/web']), ['apps/web']);
  assert.deepEqual(resolvePackageDirs(['@swv/data']), ['packages/data']);
  assert.deepEqual(resolvePackageDirs(['@swv/*']), all);
  assert.deepEqual(resolvePackageDirs(['./packages/*']), ['packages/solver', 'packages/data']);
  assert.deepEqual(resolvePackageDirs(['{./apps/web}']), ['apps/web']);
  assert.deepEqual(resolvePackageDirs(['@swv/web', '@swv/data']), ['apps/web', 'packages/data']);
  assert.deepEqual(resolvePackageDirs(['@swv/none']), all);
  assert.deepEqual(resolvePackageDirs(['...@swv/web']), all);
  assert.deepEqual(resolvePackageDirs(['!@swv/web']), all);
});

test('bash-write: コマンドが文字列でなければ解析不能', () => {
  assert.equal(analyzeBashCommand(undefined).unanalyzable.length, 1);
});

test('bash-write: heredoc の本文はデータとして除く', () => {
  assert.deepEqual(paths(analyzeBashCommand('cat <<EOF\necho x > tasks/a.md\nEOF')), []);
  assert.deepEqual(paths(analyzeBashCommand("cat <<'EOF'\necho x > tasks/a.md\nEOF")), []);
  assert.deepEqual(paths(analyzeBashCommand('cat <<-EOF\n\techo x > tasks/a.md\n\tEOF\n')), []);
});

test('bash-write: heredoc を受けるのがシェルなら本文を解析する', () => {
  assert.deepEqual(paths(analyzeBashCommand('bash <<EOF\necho x > tasks/a.md\nEOF')), ['tasks/a.md']);
});

test('bash-write: heredoc を受けるのがインタプリタなら本文を書込 API 検査にかける', () => {
  const bad = analyzeBashCommand("python3 - <<'EOF'\nopen('x','w').write('y')\nEOF");
  assert.equal(bad.unanalyzable.length, 1);
  const ok = analyzeBashCommand("python3 - <<'EOF'\nprint(1)\nEOF");
  assert.equal(ok.unanalyzable.length, 0);
});

test('bash-write: && ; | 改行でセグメントに分ける', () => {
  const r = analyzeBashCommand('echo a > a.txt && echo b > b.txt; echo c > c.txt | cat\necho d > d.txt');
  assert.deepEqual(paths(r), ['a.txt', 'b.txt', 'c.txt', 'd.txt']);
});

test('bash-write: リダイレクトの種類と除外', () => {
  assert.deepEqual(paths(analyzeBashCommand('echo x > /dev/null 2>&1')), []);
  assert.deepEqual(paths(analyzeBashCommand('echo x >&2')), []);
  assert.deepEqual(paths(analyzeBashCommand('echo x 2> err.log')), ['err.log']);
  assert.deepEqual(paths(analyzeBashCommand('echo x &> all.log')), ['all.log']);
  assert.deepEqual(paths(analyzeBashCommand('echo x >| f.txt')), ['f.txt']);
  assert.deepEqual(paths(analyzeBashCommand('echo x >> g.txt')), ['g.txt']);
});

test('bash-write: 前置きのコマンドを剥がして残りを解析する', () => {
  for (const c of [
    'FOO=1 tee a.txt',
    'env A=1 tee a.txt',
    'timeout 5 tee a.txt',
    'nice -n 5 tee a.txt',
    'nohup tee a.txt',
    'time tee a.txt',
    'command tee a.txt',
    'sudo tee a.txt',
    'pnpm exec tee a.txt',
  ]) {
    assert.deepEqual(paths(analyzeBashCommand(c)), ['a.txt'], c);
  }
});

test('bash-write: yarn は pnpm と同じ扱い', () => {
  assert.deepEqual(paths(analyzeBashCommand('yarn add lodash')), COMMAND_RULES.packageManager.writes);
  assert.deepEqual(prefixes(analyzeBashCommand('yarn format')), ['apps/web/src/', 'packages/solver/src/', 'packages/data/src/']);
});

test('bash-write: cd と cwdRel を反映し、サブシェル内の cd は閉じ括弧の後に戻す', () => {
  assert.deepEqual(paths(analyzeBashCommand('cd apps/api && echo x > src/main/java/X.java')), [
    'apps/api/src/main/java/X.java',
  ]);
  assert.deepEqual(paths(analyzeBashCommand('echo x > a.txt', { cwdRel: 'apps/api' })), ['apps/api/a.txt']);
  assert.deepEqual(paths(analyzeBashCommand('(cd apps/api && echo x > a.txt); echo y > b.txt')), [
    'apps/api/a.txt',
    'b.txt',
  ]);
});

test('bash-write: 動的な cd の後の相対パスは解析不能、絶対パスは書込先として返る', () => {
  const rel = analyzeBashCommand('cd "$X" && echo x > a.txt');
  assert.ok(rel.unanalyzable.length > 0);
  const abs = analyzeBashCommand('cd "$X" && echo x > /tmp/a.txt');
  assert.equal(abs.unanalyzable.length, 0);
  assert.deepEqual(paths(abs), ['/tmp/a.txt']);
});

test('bash-write: 閉じていないクォートと動的な書込先は解析不能', () => {
  const q = analyzeBashCommand("echo 'abc");
  assert.ok(q.unanalyzable.some((u) => u.reason.includes('クォートが閉じていません')));
  assert.ok(analyzeBashCommand('echo x > "$OUT"').unanalyzable.length > 0);
  assert.ok(analyzeBashCommand('echo x > $(pwd)/a').unanalyzable.length > 0);
});

test('bash-write: ~ はホームディレクトリに展開する', () => {
  const r = analyzeBashCommand('echo x > ~/a.txt');
  const home = os.homedir().split(path.sep).join('/');
  assert.deepEqual(paths(r), [home + '/a.txt']);
});

test('bash-write: ファイル操作コマンドの書込先', () => {
  assert.deepEqual(paths(analyzeBashCommand('tee -a a.txt b.txt')), ['a.txt', 'b.txt']);
  assert.deepEqual(paths(analyzeBashCommand("sed -i -e 's/a/b/' f.txt")), ['f.txt']);
  assert.deepEqual(paths(analyzeBashCommand("sed -i 's/a/b/' f.txt")), ['f.txt']);
  assert.deepEqual(paths(analyzeBashCommand("sed 's/a/b/' f.txt")), []);
  assert.deepEqual(paths(analyzeBashCommand("perl -pi -e 's/a/b/' f.txt")), ['f.txt']);
  assert.deepEqual(paths(analyzeBashCommand('cp a b')), ['b']);
  assert.deepEqual(paths(analyzeBashCommand('cp -t dir a b')), ['dir']);
  assert.deepEqual(paths(analyzeBashCommand('mv a b')), ['a', 'b']);
  assert.deepEqual(paths(analyzeBashCommand('rm -rf a b')), ['a', 'b']);
  assert.deepEqual(paths(analyzeBashCommand('dd if=a of=b')), ['b']);
  assert.deepEqual(paths(analyzeBashCommand('chmod 644 a.sh')), ['a.sh']);
  assert.deepEqual(paths(analyzeBashCommand('chmod -R 755 dir')), ['dir']);
  assert.deepEqual(paths(analyzeBashCommand('chown user:grp a.sh b.sh')), ['a.sh', 'b.sh']);
});

test('bash-write: git の書込先と禁止コマンド', () => {
  assert.deepEqual(paths(analyzeBashCommand('git mv a b')), ['a', 'b']);
  assert.deepEqual(paths(analyzeBashCommand('git rm a')), ['a']);
  assert.deepEqual(paths(analyzeBashCommand('git checkout HEAD -- a b')), ['a', 'b']);
  assert.deepEqual(paths(analyzeBashCommand('git restore --staged a')), []);
  assert.deepEqual(paths(analyzeBashCommand('git restore a')), ['a']);
  for (const sub of ['reset', 'clean', 'merge', 'rebase', 'pull', 'cherry-pick', 'revert', 'am', 'apply', 'push', 'switch']) {
    const r = analyzeBashCommand(`git ${sub} x`);
    assert.equal(r.forbidden.length, 1, sub);
    assert.deepEqual(r.writes, [], sub);
  }
  assert.equal(analyzeBashCommand('git checkout main').forbidden.length, 1);
  assert.equal(analyzeBashCommand('git stash').forbidden.length, 1);
  assert.equal(analyzeBashCommand('git stash push').forbidden.length, 1);
  assert.equal(analyzeBashCommand('git stash list').forbidden.length, 0);
  assert.equal(analyzeBashCommand('git stash show').forbidden.length, 0);
  assert.equal(analyzeBashCommand('git status').forbidden.length, 0);
});

test('bash-write: git commit・add・tag は引数に関わらず禁止（全体禁止）', () => {
  for (const c of [
    'git commit -m "x"',
    'git commit --amend --no-edit',
    'git add .',
    'git add -A',
    'git add apps/api/src/main/java/X.java',
    'git tag v1',
    'git tag -a v1 -m x',
    'git tag -d v1',
    'git -C apps/api commit -m x',
  ]) {
    const r = analyzeBashCommand(c);
    assert.equal(r.forbidden.length, 1, c);
    assert.deepEqual(r.writes, [], c);
  }
});

test('bash-write: git branch は一覧・--list・--show-current だけ読取り、作成・削除・改名・複製・上流設定は禁止', () => {
  const forb = (c) => analyzeBashCommand(c).forbidden.length;
  for (const c of [
    'git branch',
    'git branch -a',
    'git branch -r',
    'git branch -vv',
    'git branch --list',
    "git branch --list 'feat/*'",
    'git branch -l',
    'git branch --show-current',
    'git branch --contains abc123',
    'git branch --merged main',
    'git branch --sort=-committerdate',
  ]) {
    assert.equal(forb(c), 0, c);
  }
  for (const c of [
    'git branch feat/x',
    'git branch feat/x main',
    'git branch -d feat/x',
    'git branch -D feat/x',
    'git branch -m old new',
    'git branch -M new',
    'git branch -c old new',
    'git branch -C old new',
    'git branch --delete feat/x',
    'git branch --move old new',
    'git branch --copy old new',
    'git branch --set-upstream-to=origin/main',
    'git branch --set-upstream-to origin/main',
    'git branch -u origin/main',
    'git branch --unset-upstream',
    'git branch -f feat/x main',
    'git branch -dr origin/x',
    'git branch --abbrev 7',
  ]) {
    assert.equal(forb(c), 1, c);
  }
});

test('bash-write: git remote は -v・show・get-url だけ読取り、add・remove・set-url・rename などは禁止', () => {
  const forb = (c) => analyzeBashCommand(c).forbidden.length;
  for (const c of ['git remote', 'git remote -v', 'git remote show origin', 'git remote get-url origin']) {
    assert.equal(forb(c), 0, c);
  }
  for (const c of [
    'git remote add origin https://example.invalid/x.git',
    'git remote remove origin',
    'git remote rm origin',
    'git remote set-url origin https://example.invalid/y.git',
    'git remote rename origin up',
    'git remote prune origin',
  ]) {
    assert.equal(forb(c), 1, c);
  }
});

test('bash-write: git config は --get・--list・-l だけ読取り、設定・削除・編集は禁止', () => {
  const forb = (c) => analyzeBashCommand(c).forbidden.length;
  for (const c of [
    'git config --get user.name',
    'git config --get-all remote.origin.url',
    'git config --get-regexp "^remote"',
    'git config --list',
    'git config -l',
    'git config --global --list',
    'git config --local --get core.autocrlf',
  ]) {
    assert.equal(forb(c), 0, c);
  }
  for (const c of [
    'git config user.name x',
    'git config --global user.name x',
    'git config user.name',
    'git config --unset user.name',
    'git config --add remote.origin.fetch x',
    'git config --replace-all a.b c',
    'git config --edit',
    'git config -e',
    'git config --get --unset a.b',
    'git config --list --edit',
  ]) {
    assert.equal(forb(c), 1, c);
  }
});

test('bash-write: gh pr merge は禁止、gh の他のサブコマンドは変えない', () => {
  const forb = (c) => analyzeBashCommand(c).forbidden.length;
  for (const c of ['gh pr merge', 'gh pr merge 12 --squash', 'gh pr --repo o/r merge 12', 'gh pr merge -R o/r 12']) {
    assert.equal(forb(c), 1, c);
  }
  for (const c of ['gh pr view 12', 'gh pr list', 'gh pr create --fill', 'gh pr checks', 'gh issue list', 'gh pr']) {
    assert.equal(forb(c), 0, c);
  }
});

test('Bash: git commit・add・tag・branch の作成削除・remote の設定・config の設定・gh pr merge は全ロール deny', () => {
  for (const c of [
    'git commit -m x',
    'git add .',
    'git tag v1',
    'git branch feat/x',
    'git branch -D feat/x',
    'git remote add origin https://example.invalid/x.git',
    'git remote set-url origin https://example.invalid/y.git',
    'git config user.name x',
    'gh pr merge 12',
  ]) {
    assertBashRoles(c, { deny: ALL_ROLES });
  }
});

test('Bash: git branch の一覧・remote -v・config --get/--list・gh pr view は全ロール allow', () => {
  for (const c of [
    'git branch',
    'git branch --list',
    'git branch --show-current',
    'git remote -v',
    'git remote show origin',
    'git remote get-url origin',
    'git config --get user.name',
    'git config --list',
    'git config -l',
    'gh pr view 12',
  ]) {
    assertBashRoles(c, { allow: ALL_ROLES });
  }
});

test('Bash: git commit の deny 理由は禁止コマンドと分かる', () => {
  const r = bashDecide('git commit -m x', 'api-agent');
  assert.equal(r.decision, 'deny');
  assert.ok(r.reason.includes('禁止コマンド'), r.reason);
});

test('bash-write: フォーマッタ・リンタの対象（明示ファイル・ディレクトリ接頭辞・glob）', () => {
  assert.deepEqual(paths(analyzeBashCommand('prettier --write src/a.ts')), ['src/a.ts']);
  assert.deepEqual(prefixes(analyzeBashCommand('cd apps/web && prettier --write .')), ['apps/web/']);
  assert.deepEqual(prefixes(analyzeBashCommand('cd apps/web && eslint --fix "src/components/*.vue"')), [
    'apps/web/src/components/',
  ]);
  const check = analyzeBashCommand('prettier --check src');
  assert.deepEqual([check.writes, check.implied, check.unanalyzable], [[], [], []]);
  assert.equal(analyzeBashCommand('prettier --write').unanalyzable.length, 1);
  assert.equal(analyzeBashCommand('eslint --fix').unanalyzable.length, 1);
  assert.deepEqual(paths(analyzeBashCommand('pnpm -C apps/web exec prettier --write src/a.ts')), ['apps/web/src/a.ts']);
  assert.deepEqual(paths(analyzeBashCommand('pnpm --filter @swv/data exec prettier --write src/a.ts')), [
    'packages/data/src/a.ts',
  ]);
});

test('bash-write: gradle の暗黙の書込先', () => {
  assert.deepEqual(prefixes(analyzeBashCommand('./gradlew spotlessApply')), ['apps/api/src/']);
  assert.deepEqual(prefixes(analyzeBashCommand('./gradlew spotlessJavaApply')), ['apps/api/src/']);
  assert.deepEqual(prefixes(analyzeBashCommand('./gradlew wrapper')), ['apps/api/gradle/']);
  assert.deepEqual(prefixes(analyzeBashCommand('./gradlew build --write-locks')), ['apps/api/gradle/']);
  const hooked = analyzeBashCommand('./gradlew spotlessApply -PspotlessIdeHook=/x/y/Z.java');
  assert.deepEqual(paths(hooked), ['/x/y/Z.java']);
  assert.deepEqual(hooked.implied, []);
  const plain = analyzeBashCommand('./gradlew spotlessCheck build');
  assert.deepEqual([plain.writes, plain.implied], [[], []]);
});

test('bash-write: パッケージスクリプトの暗黙の書込先（ルート・-r・--filter・cwd）', () => {
  const allSrc = ['apps/web/src/', 'packages/solver/src/', 'packages/data/src/'];
  const allPkg = ['apps/web/', 'packages/solver/', 'packages/data/'];
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm format')), allSrc);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm -r run format')), allSrc);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm run lint')), allPkg);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm lint:eslint')), allPkg);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm lint:oxlint')), allPkg);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm --filter @swv/web run format')), ['apps/web/src/']);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm --filter @swv/solver run format')), ['packages/solver/src/']);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm --filter @swv/data run format')), ['packages/data/src/']);
  assert.deepEqual(prefixes(analyzeBashCommand("pnpm --filter './packages/*' run format")), [
    'packages/solver/src/',
    'packages/data/src/',
  ]);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm --filter=@swv/data run lint')), ['packages/data/']);
  assert.deepEqual(prefixes(analyzeBashCommand('pnpm --filter @swv/none run format')), allSrc);
  assert.deepEqual(prefixes(analyzeBashCommand('cd packages/solver && pnpm run format')), ['packages/solver/src/']);
  assert.deepEqual(paths(analyzeBashCommand('pnpm contract:types')), ['apps/web/src/main/lib/api/schema.ts']);
  const none = analyzeBashCommand('pnpm test:unit');
  assert.deepEqual([none.writes, none.implied], [[], []]);
});

test('bash-write: 依存操作の書込先', () => {
  assert.deepEqual(paths(analyzeBashCommand('npm install')), COMMAND_RULES.packageManager.writes);
  assert.deepEqual(paths(analyzeBashCommand('pnpm add x')), COMMAND_RULES.packageManager.writes);
  assert.ok(paths(analyzeBashCommand('pnpm add x')).includes('pnpm-lock.yaml'));
  assert.ok(paths(analyzeBashCommand('pnpm add x')).includes('pnpm-workspace.yaml'));
});

test('bash-write: インライン実行と再帰・動的な書込', () => {
  assert.equal(analyzeBashCommand(`python3 -c "print(1)"`).unanalyzable.length, 0);
  assert.equal(analyzeBashCommand(`perl -e 'unlink "x"'`).unanalyzable.length, 1);
  assert.equal(analyzeBashCommand(`ruby -e "File.write('x','y')"`).unanalyzable.length, 1);
  assert.deepEqual(paths(analyzeBashCommand('bash -c "echo x > a.txt"')), ['a.txt']);
  assert.equal(analyzeBashCommand('eval "echo x"').unanalyzable.length, 1);
  assert.equal(analyzeBashCommand('xargs rm').unanalyzable.length, 1);
  assert.equal(analyzeBashCommand('xargs grep foo').unanalyzable.length, 0);
  assert.equal(analyzeBashCommand('find . -name x -delete').unanalyzable.length, 1);
  assert.equal(analyzeBashCommand('find . -exec rm {} \\;').unanalyzable.length, 1);
});

test('bash-write: xargs・find -exec の sh -c は、文字列を再帰で解析し、書込が無ければ解析不能にしない', () => {
  const unan = (c) => analyzeBashCommand(c).unanalyzable.length;
  // 読み取りだけ: 解析不能にしない
  assert.equal(unan("xargs -I{} sh -c 'grep -c it {}'"), 0);
  assert.equal(unan("xargs -I{} bash -c 'cat {} | wc -l'"), 0);
  assert.equal(unan("find . -name '*.ts' -exec sh -c 'grep -c it \"$0\"' {} \\;"), 0);
  assert.equal(unan("find . -name '*.ts' -execdir bash -c 'head -n 1 \"$0\"' {} +"), 0);
  // 書込を含む: 解析不能（書込先が実行時の入力で決まる迂回経路になるため）
  assert.equal(unan("xargs sh -c 'echo x > apps/api/src/main/X.java'"), 1);
  assert.equal(unan("xargs -I{} sh -c 'echo x > {}'"), 1);
  assert.equal(unan("xargs -I{} sh -c 'rm {}'"), 1);
  assert.equal(unan("xargs sh -c 'git checkout main'"), 1);
  assert.equal(unan("find . -exec sh -c 'rm \"$0\"' {} \\;"), 1);
  // 文字列を特定できない: 解析不能
  assert.equal(unan('xargs sh'), 1);
  assert.equal(unan('xargs sh -c "$CMD"'), 1);
});

test('bash-write: xargs の読み取りコマンドは解析不能にしない（リンタ・フォーマッタは書込フラグが無いとき）', () => {
  const unan = (c) => analyzeBashCommand(c).unanalyzable.length;
  for (const c of [
    'xargs grep -n foo',
    'xargs cat',
    'xargs wc -l',
    'xargs head -n 3',
    'xargs tail -n 3',
    'xargs ls -l',
    'xargs oxlint',
    'xargs eslint',
    'xargs prettier --check',
    'xargs grep -n $PATTERN',
  ]) {
    assert.equal(unan(c), 0, c);
  }
});

test('bash-write: 書込先に変数・コマンド置換を含むものは、読み取りの引数と違って解析不能のまま', () => {
  const unan = (c) => analyzeBashCommand(c).unanalyzable.length;
  assert.equal(unan('cat "$F"'), 0);
  assert.equal(unan('grep -rn "$(git rev-parse HEAD)" apps/api/src/main'), 0);
  assert.equal(unan('pnpm exec oxlint $FILES'), 0);
  assert.equal(unan('echo x > "$OUT"'), 1);
  assert.equal(unan('tee "$OUT"'), 1);
  assert.equal(unan('cp a "$DEST"'), 1);
  assert.equal(unan('sed -i s/a/b/ "$F"'), 1);
  assert.equal(unan('pnpm exec prettier --write $FILES'), 1);
  assert.equal(unan(`python3 -c "open('x','w')"`), 1);
});

test('impliedCoverage: full・partial・none', () => {
  assert.equal(impliedCoverage('apps/web/src/main/', ['apps/web/src/main/**']), 'full');
  assert.equal(impliedCoverage('apps/web/src/main/lib/', ['apps/web/src/main/**']), 'full');
  assert.equal(impliedCoverage('contracts/paths/', ['contracts/**']), 'full');
  assert.equal(impliedCoverage('apps/web/src/', ['apps/web/src/main/**']), 'partial');
  assert.equal(
    impliedCoverage('apps/api/src/', ['apps/api/src/main/java/**', 'apps/api/src/main/resources/application*.yml']),
    'partial',
  );
  assert.equal(impliedCoverage('apps/api/src/', ['apps/web/src/main/**']), 'none');
  assert.equal(impliedCoverage('apps/api/src/', []), 'none');
});

test('diffSnapshots: 追加・変更・削除・不変（ソート済み）', () => {
  const before = { ok: true, entries: { a: '1', b: '2', c: '3', keep: 'k' } };
  const after = { ok: true, entries: { a: '1', b: '9', d: '4', keep: 'k' } };
  assert.deepEqual(diffSnapshots(before, after), ['b', 'c', 'd']);
  assert.deepEqual(diffSnapshots(before, before), []);
  assert.deepEqual(diffSnapshots({ entries: {} }, { entries: {} }), []);
  assert.deepEqual(diffSnapshots({ z: '1' }, { z: '2', y: '1' }), ['y', 'z']);
});

test('takeSnapshot: git status の出力からパスとハッシュを取る（rename は新旧両方）', () => {
  const calls = [];
  const fakeSpawn = (cmd, args) => {
    calls.push([cmd, ...args]);
    return { status: 0, stdout: ' M a.txt\0?? b.txt\0R  new.txt\0old.txt\0' };
  };
  const fakeRead = (p) => {
    if (String(p).endsWith('old.txt')) throw new Error('ENOENT');
    return Buffer.from('x');
  };
  const snap = takeSnapshot('/repo', { spawnSync: fakeSpawn, readFileSync: fakeRead });
  const h = crypto.createHash('sha1').update(Buffer.from('x')).digest('hex');
  assert.equal(snap.ok, true);
  assert.deepEqual(snap.entries, { 'a.txt': h, 'b.txt': h, 'new.txt': h, 'old.txt': 'absent' });
  assert.equal(calls[0][0], 'git');
  assert.ok(calls[0].includes('status'));
});

test('takeSnapshot: git を実行できない・失敗したときは ok: false', () => {
  const noGit = takeSnapshot('/repo', { spawnSync: () => ({ error: new Error('spawn git ENOENT') }) });
  assert.equal(noGit.ok, false);
  const failed = takeSnapshot('/repo', { spawnSync: () => ({ status: 128, stdout: '' }) });
  assert.equal(failed.ok, false);
});

// --- CLI 配線 ---

function runCli(role, stdinObj) {
  return spawnSync('node', [SCRIPT_PATH, role], {
    input: JSON.stringify(stdinObj),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: stdinObj.cwd },
  });
}

test('CLI: deny 時は妥当な JSON を返す', () => {
  const root = fixtureRoot();
  const res = runCli('api-agent', {
    tool_name: 'Write',
    tool_input: { file_path: 'apps/api/build.gradle.kts' },
    cwd: root,
  });
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
});

test('CLI: allow 時は空出力・終了コード0', () => {
  const root = fixtureRoot();
  fs.mkdirSync(path.join(root, 'apps/api/src/main/java/x'), { recursive: true });
  const res = runCli('api-agent', {
    tool_name: 'Write',
    tool_input: { file_path: 'apps/api/src/main/java/x/X.java' },
    cwd: root,
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('CLI: solver-agent の packages/data/** への Write は deny', () => {
  const root = fixtureRoot();
  const res = runCli('solver-agent', {
    tool_name: 'Write',
    tool_input: { file_path: 'packages/data/src/main/a.ts' },
    cwd: root,
  });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('CLI: test-investigator のリポジトリ内への Write は deny', () => {
  const root = fixtureRoot();
  const res = runCli('test-investigator', {
    tool_name: 'Write',
    tool_input: { file_path: 'apps/api/src/test/java/x/XTest.java' },
    cwd: root,
  });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('CLI: PreToolUse の Bash deny（hook_event_name あり・なしのどちらも）で妥当な JSON を返す', () => {
  const root = fixtureRoot();
  const cmd = 'echo x > apps/api/build.gradle.kts';
  for (const extra of [{ hook_event_name: 'PreToolUse' }, {}]) {
    const res = runCli('api-agent', {
      ...extra,
      tool_name: 'Bash',
      tool_input: { command: cmd },
      cwd: root,
      session_id: `s-${crypto.randomUUID()}`,
      tool_use_id: 'tu-deny',
    });
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(parsed.hookSpecificOutput.permissionDecisionReason.length > 0);
  }
});

test('CLI: PreToolUse の Bash が解析不能なら deny', () => {
  const root = fixtureRoot();
  const res = runCli('api-agent', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'echo x > "$OUT"' },
    cwd: root,
    session_id: `s-${crypto.randomUUID()}`,
    tool_use_id: 'tu-dyn',
  });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('CLI: PreToolUse の Bash が xargs sh -c の読み取りだけなら allow（空出力）', () => {
  const root = fixtureRoot();
  const res = runCli('web-test-agent', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: "ls apps/web/src/test | xargs -I{} sh -c 'grep -c it {}'" },
    cwd: root,
    session_id: `s-${crypto.randomUUID()}`,
    tool_use_id: 'tu-xargs-ro',
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('CLI: PreToolUse の Bash が xargs sh -c で許可外へ書くなら deny', () => {
  const root = fixtureRoot();
  const res = runCli('api-agent', {
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: "xargs sh -c 'echo x > apps/api/src/main/X.java'" },
    cwd: root,
    session_id: `s-${crypto.randomUUID()}`,
    tool_use_id: 'tu-xargs-w',
  });
  assert.equal(res.status, 0);
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('CLI: PostToolUse で Bash 以外のツールは何も出力しない', () => {
  const root = fixtureRoot();
  const res = runCli('api-agent', {
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'apps/api/src/main/java/x/X.java' },
    cwd: root,
    session_id: `s-${crypto.randomUUID()}`,
    tool_use_id: 'tu-w',
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

const HAS_GIT = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
const GIT_SKIP = HAS_GIT ? false : 'git が実行環境に無いため、git 差分を使う事後照合の CLI テストを実行できない';

function git(root, args) {
  return spawnSync(
    'git',
    ['-C', root, '-c', 'user.name=guard-test', '-c', 'user.email=guard-test@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { encoding: 'utf8' },
  );
}

// git init と初回コミット済みの fixture（一時ディレクトリ。実リポジトリには触れない）。
function makeGitFixture() {
  const root = fixtureRoot();
  fs.mkdirSync(path.join(root, 'apps/api/src/main/java/x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/api/src/main/java/x/X.java'), 'class X {}\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'hello\n');
  assert.equal(git(root, ['init', '-q']).status, 0);
  assert.equal(git(root, ['add', '-A']).status, 0);
  const c = git(root, ['commit', '-q', '-m', 'init']);
  assert.equal(c.status, 0, c.stderr);
  return root;
}

function hookInput(root, sessionId, toolUseId, event, command) {
  return {
    hook_event_name: event,
    tool_name: 'Bash',
    tool_input: { command },
    cwd: root,
    session_id: sessionId,
    tool_use_id: toolUseId,
  };
}

test('CLI 事後照合: 許可フォルダ外の変化があれば block を返す', { skip: GIT_SKIP }, () => {
  const root = makeGitFixture();
  const sid = `s-${crypto.randomUUID()}`;
  try {
    const pre = runCli('api-agent', hookInput(root, sid, 'tu-1', 'PreToolUse', './gradlew build'));
    assert.equal(pre.status, 0);
    assert.equal(pre.stdout, '');

    fs.writeFileSync(path.join(root, 'README.md'), 'changed\n');

    const post = runCli('api-agent', hookInput(root, sid, 'tu-1', 'PostToolUse', './gradlew build'));
    assert.equal(post.status, 0);
    const parsed = JSON.parse(post.stdout);
    assert.equal(parsed.decision, 'block');
    assert.ok(parsed.reason.includes('README.md'), parsed.reason);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  } finally {
    fs.rmSync(path.join(os.tmpdir(), 'agent-write-guard', sid), { recursive: true, force: true });
  }
});

test('CLI 事後照合: 許可フォルダ内だけの変化なら出力は空', { skip: GIT_SKIP }, () => {
  const root = makeGitFixture();
  const sid = `s-${crypto.randomUUID()}`;
  try {
    const pre = runCli('api-agent', hookInput(root, sid, 'tu-2', 'PreToolUse', './gradlew build'));
    assert.equal(pre.status, 0);
    assert.equal(pre.stdout, '');

    fs.writeFileSync(path.join(root, 'apps/api/src/main/java/x/X.java'), 'class X { int a; }\n');
    fs.writeFileSync(path.join(root, 'apps/api/src/main/java/x/New.java'), 'class New {}\n');

    const post = runCli('api-agent', hookInput(root, sid, 'tu-2', 'PostToolUse', './gradlew build'));
    assert.equal(post.status, 0);
    assert.equal(post.stdout, '');
  } finally {
    fs.rmSync(path.join(os.tmpdir(), 'agent-write-guard', sid), { recursive: true, force: true });
  }
});

test('CLI 事後照合: test-investigator がリポジトリ内を変えたら block を返す', { skip: GIT_SKIP }, () => {
  const root = makeGitFixture();
  const sid = `s-${crypto.randomUUID()}`;
  try {
    const pre = runCli('test-investigator', hookInput(root, sid, 'tu-3', 'PreToolUse', 'pnpm test:unit'));
    assert.equal(pre.status, 0);
    assert.equal(pre.stdout, '');

    fs.writeFileSync(path.join(root, 'apps/api/src/main/java/x/X.java'), 'class X { int a; }\n');

    const post = runCli('test-investigator', hookInput(root, sid, 'tu-3', 'PostToolUse', 'pnpm test:unit'));
    assert.equal(post.status, 0);
    assert.equal(JSON.parse(post.stdout).decision, 'block');
  } finally {
    fs.rmSync(path.join(os.tmpdir(), 'agent-write-guard', sid), { recursive: true, force: true });
  }
});

test('CLI 事後照合: スナップショットが無いときは黙って通さず additionalContext を返す', () => {
  const root = fixtureRoot();
  const res = runCli('api-agent', hookInput(root, `s-${crypto.randomUUID()}`, 'tu-none', 'PostToolUse', 'ls'));
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(parsed.hookSpecificOutput.additionalContext.length > 0);
  assert.notEqual(parsed.decision, 'block');
});

// --- 構成の一致（ドリフト検出） ---

function frontmatterOf(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return m ? m[1] : '';
}

// agents の `tools:` はカンマ区切りで書かれる（空白区切りでも読めるようにしておく）。
function toolsOf(fm) {
  const m = /^tools:\s*(.+)$/m.exec(fm);
  return m ? m[1].split(/[\s,]+/).filter(Boolean) : [];
}

// YAML の1行のスカラー値（ダブルクォート・シングルクォート・裸）を文字列にする。
function yamlScalar(raw) {
  const s = raw.trim();
  if (s.startsWith('"')) return JSON.parse(s);
  if (s.startsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

// frontmatter から、書込ガードを呼ぶ hook の command 文字列（YAML のエスケープを解いたもの）を取り出す。
function guardCommandsOf(fm) {
  const out = [];
  for (const line of fm.split(/\r?\n/)) {
    const m = /^\s*(?:-\s+)?command:\s*(.+)$/.exec(line);
    if (m && m[1].includes('agent-write-guard.mjs')) out.push(yamlScalar(m[1]));
  }
  return out;
}

function agentsDirOrNull() {
  const dir = path.join(__dirname, '../../../agents');
  return fs.existsSync(dir) ? dir : null;
}

function readAgents(agentsDir) {
  const result = new Map();
  for (const d of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const mdPath = path.join(agentsDir, d.name, `${d.name}.md`);
    if (fs.existsSync(mdPath)) result.set(d.name, fs.readFileSync(mdPath, 'utf8'));
  }
  return result;
}

test('構成の一致: write-scopes.json のロールは、書込を許す12役割（実装・テスト・契約・データモデル・調査）である', () => {
  assert.deepEqual(
    Object.keys(scopes.roles).sort(),
    [
      'api-agent',
      'api-test-agent',
      'contract-agent',
      'data-agent',
      'data-model-agent',
      'data-test-agent',
      'e2e-agent',
      'solver-agent',
      'solver-test-agent',
      'test-investigator',
      'web-agent',
      'web-test-agent',
    ],
  );
  assert.deepEqual(scopes.roles['test-investigator'], []);
});

test('構成の一致: 役割の許可 glob は、ロールどうしで重ならない（同じ glob を2つの役割に置かない）', () => {
  const seen = new Map();
  for (const [role, globs] of Object.entries(scopes.roles)) {
    for (const g of globs) {
      assert.ok(!seen.has(g), `glob "${g}" が ${seen.get(g)} と ${role} の両方にある`);
      seen.set(g, role);
    }
  }
});

test('構成の一致: 代表のパスは、自分のロールの glob にだけ一致する（glob 同士の包含で重なっていない）', () => {
  for (const [role, p] of Object.entries(OWN_PATHS)) {
    const matched = Object.entries(scopes.roles)
      .filter(([, globs]) => globs.some((g) => globToRegExp(g).test(p)))
      .map(([r]) => r);
    assert.deepEqual(matched, [role], `${p} に一致するロール`);
  }
});

test('構成の一致: impact-scope/SKILL.md の書込許可フォルダの表が write-scopes.json と一致する', () => {
  const content = fs.readFileSync(path.join(__dirname, '../SKILL.md'), 'utf8');
  for (const [role, globs] of Object.entries(scopes.roles)) {
    assert.ok(content.includes(`| ${role} |`), `impact-scope/SKILL.md の表に ${role} の行が見当たらない`);
    for (const g of globs) {
      assert.ok(content.includes(g), `impact-scope/SKILL.md に ${role} の glob "${g}" が見当たらない`);
    }
  }
});

test('構成の一致: tools の書式（カンマ区切り・空白区切り）を読める', () => {
  assert.deepEqual(toolsOf('name: x\ntools: Read, Grep, Glob\nmodel: opus'), ['Read', 'Grep', 'Glob']);
  assert.deepEqual(toolsOf('tools: Read Bash'), ['Read', 'Bash']);
  assert.deepEqual(toolsOf('name: x'), []);
});

test('構成の一致: hooks の command を YAML のエスケープを解いて取り出せる', () => {
  const fm = [
    'hooks:',
    '  PreToolUse:',
    '    - matcher: "Write|Edit|NotebookEdit|Bash"',
    '      hooks:',
    '        - type: command',
    '          command: "node \\"${CLAUDE_PROJECT_DIR}/.claude/skills/impact-scope/scripts/agent-write-guard.mjs\\" api-agent"',
  ].join('\n');
  assert.deepEqual(guardCommandsOf(fm), [
    'node "${CLAUDE_PROJECT_DIR}/.claude/skills/impact-scope/scripts/agent-write-guard.mjs" api-agent',
  ]);
});

test('構成の一致: agents 定義があれば write-scopes.json のロールと同期している', () => {
  const agentsDir = agentsDirOrNull();
  if (!agentsDir) return; // agents ディレクトリが無いツリーではスキップする（配置後は必ず存在する）
  const agentFiles = readAgents(agentsDir);
  for (const role of Object.keys(scopes.roles)) {
    assert.ok(agentFiles.has(role), `${role} の定義（.claude/agents/${role}/${role}.md）が無い`);
    const content = agentFiles.get(role);
    assert.ok(content.includes('agent-write-guard.mjs'), `${role} に agent-write-guard.mjs の配線が無い`);
    assert.ok(content.includes(role), `${role} の frontmatter に自分の name が無い`);
  }
  const reviewer = agentFiles.get('reviewer-agent');
  if (reviewer) {
    assert.ok(!reviewer.includes('agent-write-guard.mjs'), 'reviewer-agent に書込ガードの配線がある');
  }
});

test('構成の一致: tools に Bash を持つエージェントは PreToolUse の Bash と PostToolUse の Bash を配線している', () => {
  const agentsDir = agentsDirOrNull();
  if (!agentsDir) return;
  const agentFiles = readAgents(agentsDir);
  for (const role of Object.keys(scopes.roles)) {
    if (!agentFiles.has(role)) continue;
    const fm = frontmatterOf(agentFiles.get(role));
    if (!toolsOf(fm).includes('Bash')) continue;
    const pre = /PreToolUse:\s*- matcher:\s*"([^"]*)"/.exec(fm);
    assert.ok(pre, `${role} に PreToolUse の matcher が無い`);
    assert.ok(pre[1].split('|').includes('Bash'), `${role} の PreToolUse の matcher に Bash が無い: ${pre[1]}`);
    const postIdx = fm.indexOf('PostToolUse:');
    assert.ok(postIdx >= 0, `${role} に PostToolUse の配線が無い`);
    const post = /PostToolUse:\s*- matcher:\s*"([^"]*)"/.exec(fm);
    assert.ok(post, `${role} に PostToolUse の matcher が無い`);
    assert.ok(post[1].split('|').includes('Bash'), `${role} の PostToolUse の matcher に Bash が無い: ${post[1]}`);
    assert.ok(fm.slice(postIdx).includes('agent-write-guard.mjs'), `${role} の PostToolUse にガードの呼出しが無い`);
  }
});

test('構成の一致: write-scopes.json のロールと、ガードを配線したエージェントの集合が一致する', () => {
  const agentsDir = agentsDirOrNull();
  if (!agentsDir) return;
  const guarded = [];
  for (const [name, content] of readAgents(agentsDir)) {
    const fm = frontmatterOf(content);
    if (!fm.includes('agent-write-guard.mjs')) continue;
    guarded.push(name);
    // 配線のロール名引数は、そのエージェント自身の名前でなければならない。
    const commands = guardCommandsOf(fm);
    assert.ok(commands.length > 0, `${name} の hook の command を取り出せない`);
    for (const cmd of commands) {
      const m = /agent-write-guard\.mjs"?\s+([A-Za-z0-9_-]+)/.exec(cmd);
      assert.ok(m, `${name} の command にロール名引数が無い: ${cmd}`);
      assert.equal(m[1], name, `${name} の配線のロール名引数が違う: ${m[1]}`);
    }
  }
  assert.deepEqual(guarded.sort(), Object.keys(scopes.roles).sort());
});

test('構成の一致: 書込ツールを持たないエージェントにガードの配線も書込ツールも無い', () => {
  const agentsDir = agentsDirOrNull();
  if (!agentsDir) return;
  const agentFiles = readAgents(agentsDir);
  for (const name of ['reviewer-agent', 'screen-design-agent']) {
    if (!agentFiles.has(name)) continue;
    const fm = frontmatterOf(agentFiles.get(name));
    assert.ok(!fm.includes('agent-write-guard.mjs'), `${name} にガードの配線がある`);
    const tools = toolsOf(fm);
    for (const banned of ['Write', 'Edit', 'Bash', 'NotebookEdit']) {
      assert.ok(!tools.includes(banned), `${name} の tools に ${banned} がある`);
    }
  }
});

// 配線した command そのものを、実際の起動経路（sh -c・CLAUDE_PROJECT_DIR・stdin の JSON）で子プロセスとして起動する。
test('配線の実起動: frontmatter の command をそのまま起動し、担当内は allow・担当外は deny になる', () => {
  const agentsDir = agentsDirOrNull();
  if (!agentsDir) return;
  const agentFiles = readAgents(agentsDir);
  for (const role of Object.keys(scopes.roles)) {
    if (!agentFiles.has(role)) continue;
    const commands = guardCommandsOf(frontmatterOf(agentFiles.get(role)));
    assert.ok(commands.length > 0, `${role} の hook の command を取り出せない`);
    const run = (filePath) =>
      spawnSync('sh', ['-c', commands[0]], {
        input: JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: { file_path: filePath },
          cwd: REPO_ROOT,
        }),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
      });
    const own = OWN_PATHS[role];
    if (own) {
      const ok = run(own);
      assert.equal(ok.status, 0, `${role}: ${ok.stderr}`);
      assert.equal(ok.stdout, '', `${role} の担当内の Write は allow（空出力）のはず: ${ok.stdout}`);
    }
    const ng = run('CLAUDE.md');
    assert.equal(ng.status, 0, `${role}: ${ng.stderr}`);
    assert.equal(JSON.parse(ng.stdout).hookSpecificOutput.permissionDecision, 'deny', `${role} が CLAUDE.md へ書ける`);
  }
});

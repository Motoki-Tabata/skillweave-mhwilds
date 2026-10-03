import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import {
  AREAS,
  buildOutputPath,
  classifyPath,
  formatAreas,
  OTHER_AREA,
  parseArgs,
  parseShortstat,
  summarizeAreas,
} from './review-diff.mjs';

test('parseArgs: base だけなら head は HEAD', () => {
  assert.deepEqual(parseArgs(['abc1234']), { base: 'abc1234', head: 'HEAD' });
});

test('parseArgs: base と head を取る', () => {
  assert.deepEqual(parseArgs(['abc1234', 'def5678']), { base: 'abc1234', head: 'def5678' });
});

test('parseArgs: 引数なし・3個以上はエラー', () => {
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(['a', 'b', 'c']));
});

test('parseArgs: オプション形式の不明な引数はエラー', () => {
  assert.throws(() => parseArgs(['--bogus']));
  assert.throws(() => parseArgs(['abc1234', '--all']));
});

test('buildOutputPath: 先頭7桁ずつを使った tsod-review 配下の .diff になる', () => {
  const p = buildOutputPath('0123456789abcdef', 'fedcba9876543210', '/tmp/x');
  assert.equal(p, path.join('/tmp/x', 'tsod-review', '0123456-fedcba9.diff'));
});

test('buildOutputPath: ref に区切り文字があってもパスを壊さない', () => {
  const p = buildOutputPath('feat/a', 'HEAD', '/tmp/x');
  assert.equal(path.dirname(p), path.join('/tmp/x', 'tsod-review'));
  assert.ok(!path.basename(p).includes('/'));
  assert.ok(p.endsWith('.diff'));
});

test('parseShortstat: 件数を取り出す', () => {
  const s = ' 12 files changed, 345 insertions(+), 67 deletions(-)\n';
  assert.deepEqual(parseShortstat(s), { files: 12, insertions: 345, deletions: 67 });
});

test('parseShortstat: 単数形・片方だけの表記でも取れる', () => {
  assert.deepEqual(parseShortstat(' 1 file changed, 1 insertion(+)\n'), { files: 1, insertions: 1, deletions: 0 });
  assert.deepEqual(parseShortstat(' 2 files changed, 3 deletions(-)\n'), { files: 2, insertions: 0, deletions: 3 });
});

test('parseShortstat: 差分が無ければすべて 0', () => {
  assert.deepEqual(parseShortstat(''), { files: 0, insertions: 0, deletions: 0 });
});

// --- 領域の分類（swv のパス） ---

test('classifyPath: swv のパスを api・web・solver・data・contracts・docker に分ける', () => {
  const cases = {
    'apps/api/src/main/java/io/github/x/A.java': 'api',
    'apps/api/src/test/java/io/github/x/ATest.java': 'api',
    'apps/api/build.gradle.kts': 'api',
    'apps/web/src/main/lib/http.ts': 'web',
    'apps/web/src/test/lib/http.spec.ts': 'web',
    'apps/web/e2e/a.spec.ts': 'web',
    'packages/solver/src/main/index.ts': 'solver',
    'packages/solver/src/test/a.spec.ts': 'solver',
    'packages/data/src/main/index.ts': 'data',
    'packages/data/dist/master.json': 'data',
    'contracts/openapi.yaml': 'contracts',
    'contracts/paths/items/items.yaml': 'contracts',
    'docker/compose.yaml': 'docker',
  };
  for (const [p, area] of Object.entries(cases)) {
    assert.equal(classifyPath(p), area, p);
  }
});

test('classifyPath: どの領域にも当たらないものは「その他」（共有構成ファイル・文書・Windows 区切りも）', () => {
  for (const p of [
    'package.json',
    'pnpm-workspace.yaml',
    'specs/001-x/spec.md',
    'design/tech-stack.md',
    '.github/workflows/ci.yml',
    'scripts/sonar-local.sh',
    'README.md',
    'apps/README.md',
    'packages/README.md',
    'apps/apiary/x.ts',
  ]) {
    assert.equal(classifyPath(p), OTHER_AREA, p);
  }
  assert.equal(classifyPath('apps\\web\\src\\main\\a.ts'), 'web');
});

test('AREAS: 領域の語彙は spec.md「影響範囲」の「触る領域」と同じ（docker・contracts を含む6語）', () => {
  assert.deepEqual(
    AREAS.map(([a]) => a),
    ['api', 'web', 'solver', 'data', 'contracts', 'docker'],
  );
});

test('summarizeAreas: 領域別の件数を AREAS の順に数え、「その他」を最後に置く。0件の領域は含めない', () => {
  const summary = summarizeAreas([
    'package.json',
    'apps/web/src/main/a.ts',
    'apps/api/src/main/java/A.java',
    'apps/web/src/test/a.spec.ts',
    'contracts/openapi.yaml',
    'specs/x.md',
  ]);
  assert.deepEqual(summary, [
    { area: 'api', count: 1 },
    { area: 'web', count: 2 },
    { area: 'contracts', count: 1 },
    { area: OTHER_AREA, count: 2 },
  ]);
  assert.deepEqual(summarizeAreas([]), []);
});

test('formatAreas: 1行にまとめる', () => {
  assert.equal(
    formatAreas([
      { area: 'api', count: 1 },
      { area: 'web', count: 2 },
    ]),
    '領域別: api 1 / web 2',
  );
  assert.equal(formatAreas([]), '領域別: なし');
});

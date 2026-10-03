#!/usr/bin/env node
// tsod-verify: CLAUDE.md「Commands」節・.github/workflows/ci.yml の api/web/packages ジョブの写し（e2e・Sonar は指定したときだけ）。
// Node ESM・依存ゼロ（Node 組込みモジュールのみ）。Node 20+。
//
// CLAUDE.md の表・ci.yml との意図的な差（CLAUDE.md「Commands」の「意図的な差」と一致させる。一致は区間 E の drift-scan が検査する）。
//   1. 契約型フレッシュネス: 作業ツリーの schema.ts を書き換えず、一時ファイルへ再生成して現行の schema.ts と
//      バイト比較する（表は `pnpm contract:types` 実行後の `git diff --exit-code`。未コミット・未ステージでも正しく判定する）。
//   2. api: `spotlessCheck build` と `contractTest` を別の段にする（draft 残存中の contractTest の失敗を
//      区別して XFAIL と表示するため）。
//   3. `--rerun-tasks`・`--rerun` を付けて、Gradle の UP-TO-DATE（キャッシュ済みの結果）を避ける。
//   4. typecheck（`classes testClasses`）は build に含まれるため、個別の段にしない（ci.yml も同じ）。
//   5. `test:coverage` は通常の一括検証に含めない（Sonar の全体解析 `--sonar` が実行する）。
//   6. web・packages は `pnpm --filter` で分ける（ci.yml も同じ。表のルート直下の `pnpm lint:check` 等は全パッケージ一括）。
//
// 結果の種別: PASS／FAIL／SKIP／XFAIL。SKIP は「未設定または未指定で実行しない段」で、終了コード 0 に数える。
// 前提コマンド（pnpm・java・docker など）が無いときは SKIP でなく PREREQ（前提不足）で、終了コード 2。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const VALID_AREAS = ['api', 'web', 'packages', 'e2e', 'sonar'];
const VALID_SONAR_AREAS = ['api', 'web', 'packages'];
const SCHEMA_PATH = 'apps/web/src/main/lib/api/schema.ts';
const OPENAPI_FROM_WEB = '../../contracts/openapi.yaml';
const E2E_UNSET_REASON = '未設定: apps/web に test:e2e と e2e/ が必要';

/**
 * 引数を解析する。純関数。不正な引数は Error を投げる。
 * `--sonar-area <api|web|packages>`（領域の Sonar モード）は `--only`・`--e2e`・`--sonar` と併用できない。
 * `--base <ref>` は `--sonar-area` と一緒のときだけ有効。
 */
export function parseArgs(argv) {
  const result = { only: null, e2e: false, sonar: false, dryRun: false, allowDraft: false, sonarArea: null, base: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') {
      const value = argv[i + 1];
      if (!VALID_AREAS.includes(value)) {
        throw new Error(`--only の値が不正です: ${value ?? '(未指定)'}。api|web|packages|e2e|sonar のいずれかを指定してください。`);
      }
      result.only = value;
      i++;
    } else if (arg === '--sonar-area') {
      const value = argv[i + 1];
      if (!VALID_SONAR_AREAS.includes(value)) {
        throw new Error(`--sonar-area の値が不正です: ${value ?? '(未指定)'}。api|web|packages のいずれかを指定してください。`);
      }
      result.sonarArea = value;
      i++;
    } else if (arg === '--base') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--base の値が未指定です。比較元の ref を指定してください。');
      }
      result.base = value;
      i++;
    } else if (arg === '--e2e') {
      result.e2e = true;
    } else if (arg === '--sonar') {
      result.sonar = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--allow-draft') {
      result.allowDraft = true;
    } else {
      throw new Error(`不明な引数です: ${arg}`);
    }
  }
  if (result.sonarArea !== null && (result.only !== null || result.e2e || result.sonar)) {
    throw new Error('--sonar-area は --only・--e2e・--sonar と併用できません。');
  }
  if (result.base !== null && result.sonarArea === null) {
    throw new Error('--base は --sonar-area と一緒に指定したときだけ有効です。');
  }
  return result;
}

/**
 * e2e が設定済みかを、ファイルシステムから読む。`apps/web/package.json` に `test:e2e` があり、`apps/web/e2e/` がある。
 * buildPlan は純関数のまま保つため、この結果を引数で渡す。
 */
export function detectE2eConfigured(root = '.') {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'apps/web/package.json'), 'utf8'));
    const hasScript = typeof pkg?.scripts?.['test:e2e'] === 'string';
    const hasDir = statSync(path.join(root, 'apps/web/e2e')).isDirectory();
    return hasScript && hasDir;
  } catch {
    return false;
  }
}

function skipStep(area, name, reason) {
  return { area, name, skip: reason };
}

function webStep(script) {
  return {
    area: 'web',
    name: script,
    cwd: '.',
    prereqCmd: 'pnpm',
    command: 'pnpm',
    args: ['--filter', '@swv/web', 'run', script],
  };
}

function rootPnpmStep(area, script) {
  return { area, name: script, cwd: '.', prereqCmd: 'pnpm', command: 'pnpm', args: [script] };
}

function packagesStep(script) {
  return {
    area: 'packages',
    name: `packages: ${script}`,
    cwd: '.',
    prereqCmd: 'pnpm',
    command: 'pnpm',
    args: ['--filter', './packages/*', 'run', script],
  };
}

function stepsForArea(area, { e2eConfigured = false } = {}) {
  if (area === 'api') {
    return [
      {
        area: 'api',
        name: 'spotlessCheck / build',
        cwd: 'apps/api',
        prereqCmd: 'java',
        command: './gradlew',
        args: ['spotlessCheck', 'build', '--rerun-tasks', '--console=plain'],
      },
      {
        area: 'api',
        name: 'contractTest',
        cwd: 'apps/api',
        prereqCmd: 'java',
        command: './gradlew',
        args: ['contractTest', '--rerun', '--console=plain'],
        classify: 'contractTest',
      },
    ];
  }
  if (area === 'web') {
    return [
      webStep('lint:check'),
      webStep('format:check'),
      webStep('type-check'),
      webStep('test:unit'),
      webStep('build'),
      rootPnpmStep('web', 'contract:lint'),
      {
        area: 'web',
        name: 'contract:types フレッシュネス（一時生成と比較）',
        cwd: 'apps/web',
        prereqCmd: 'pnpm',
        special: 'schemaFreshness',
      },
      rootPnpmStep('web', 'contract:docs'),
      rootPnpmStep('web', 'contract:swagger'),
    ];
  }
  if (area === 'packages') {
    return [packagesStep('lint:check'), packagesStep('format:check'), packagesStep('type-check'), packagesStep('test:unit')];
  }
  if (area === 'e2e') {
    if (!e2eConfigured) {
      return [skipStep('e2e', 'e2e', E2E_UNSET_REASON)];
    }
    return [
      {
        area: 'e2e',
        name: 'docker compose up（インフラ起動）',
        cwd: '.',
        prereqCmd: 'docker',
        command: 'docker',
        args: ['compose', '-f', 'docker/compose.yaml', 'up', '-d', '--wait'],
      },
      {
        area: 'e2e',
        name: 'api 起動と待ち受け確認',
        cwd: 'apps/api',
        prereqCmd: 'java',
        special: 'startApiAndWait',
      },
      {
        area: 'e2e',
        name: 'pnpm test:e2e',
        cwd: '.',
        prereqCmd: 'pnpm',
        command: 'pnpm',
        args: ['--filter', '@swv/web', 'run', 'test:e2e'],
      },
      {
        area: 'e2e',
        name: 'api プロセス停止（自分が起動した PID のみ）',
        cwd: '.',
        special: 'stopApi',
      },
    ];
  }
  if (area === 'sonar') {
    return [
      {
        area: 'sonar',
        name: 'sonar-local.sh',
        cwd: '.',
        prereqCmd: 'bash',
        command: 'bash',
        args: ['scripts/sonar-local.sh'],
      },
    ];
  }
  return [];
}

/**
 * 実行計画を組み立てる。純関数。
 * `sonarArea` のときは、領域の Sonar 解析の1段だけ（テストを再実行せず、変更したファイルの新規コードだけを解析する）。
 * 既定は api・web・packages。e2e と Sonar は、指定が無ければコマンドを持たない SKIP の段（未指定）にする。
 * e2e は `e2eConfigured`（detectE2eConfigured の結果）が false のとき、指定しても SKIP の段（未設定）になる。
 */
export function buildPlan(options, { e2eConfigured = false } = {}) {
  const env = { e2eConfigured };
  if (options.sonarArea) {
    const area = options.sonarArea;
    return [
      {
        area: 'sonar',
        name: `sonar-local.sh --area ${area}`,
        cwd: '.',
        prereqCmd: 'bash',
        command: 'bash',
        args: ['scripts/sonar-local.sh', '--area', area, ...(options.base ? ['--base', options.base] : [])],
      },
    ];
  }
  if (options.only) {
    return stepsForArea(options.only, env);
  }
  const plan = ['api', 'web', 'packages'].flatMap((a) => stepsForArea(a, env));
  plan.push(...(options.e2e ? stepsForArea('e2e', env) : [skipStep('e2e', 'e2e', '未指定')]));
  plan.push(...(options.sonar ? stepsForArea('sonar', env) : [skipStep('sonar', 'sonar', '未指定')]));
  return plan;
}

/**
 * contractTest の最終の状態と注記を決める。純関数。
 * draft（`x-swv-status: draft`）が残っている間の contractTest の失敗は、--allow-draft のときだけ想定内（XFAIL）として扱う。
 */
export function classifyContractTest({ status, draftMarkers = [], allowDraft = false }) {
  const count = Array.isArray(draftMarkers) ? draftMarkers.length : 0;
  if (status === 'PASS') {
    return { status: 'PASS', note: count > 0 ? `draft 残存 ${count} 件（回収前）` : '' };
  }
  if (status !== 'FAIL') {
    return { status, note: '' };
  }
  if (count === 0) {
    return { status: 'FAIL', note: '' };
  }
  if (allowDraft) {
    return {
      status: 'XFAIL',
      note: '想定内: draft 残存中の contractTest 失敗。回収後に --allow-draft なしで再実行して PASS を確かめる',
    };
  }
  return { status: 'FAIL', note: `draft 残存 ${count} 件あり。draft 起因の可能性。回収後に再実行する` };
}

/**
 * scripts/sonar-local.sh の出力から件数を取り出す。純関数。
 * 「未解決: issue N 件 / 未レビュー hotspot M 件」の行が無ければ null。Quality Gate の行が無ければ qualityGate: null。
 * 件数行の文言は scripts/sonar-local.sh の領域モード・全体モードの出力と一致させる（一致は verify.test.mjs が実物を読んで検査する）。
 */
export function extractSonarCounts(output) {
  const text = String(output ?? '');
  const counts = text.match(/未解決:\s*issue\s+(\d+)\s*件\s*\/\s*未レビュー\s*hotspot\s+(\d+)\s*件/);
  if (!counts) return null;
  const gate = text.match(/^Quality Gate:\s*([A-Za-z_]+)/m);
  return {
    issues: Number(counts[1]),
    hotspots: Number(counts[2]),
    qualityGate: gate ? gate[1] : null,
  };
}

/**
 * 契約型のフレッシュネスを、現行の schema.ts と再生成した内容のバイト一致で判定する。純関数。
 */
export function judgeFreshness(currentBuf, generatedBuf) {
  if (currentBuf === null || currentBuf === undefined) {
    return { status: 'FAIL', reason: 'schema.ts が見つからない。`pnpm contract:types` で再生成する' };
  }
  const a = Buffer.from(currentBuf);
  const b = Buffer.from(generatedBuf ?? '');
  if (a.equals(b)) {
    return { status: 'PASS', reason: '' };
  }
  return {
    status: 'FAIL',
    reason: 'schema.ts が契約から再生成した結果と一致しない。`pnpm contract:types` で再生成する',
  };
}

/**
 * Sonar の段の件数行を作る。純関数。
 * 領域モード（--area 付き）は Quality Gate を出さず、件数だけを表示する。
 */
export function sonarCountsLine(r) {
  if (r.status === 'SKIP' || r.status === 'PREREQ') return '  Sonar 件数: 未取得（SKIP）';
  const c = r.sonarCounts;
  if (!c) return '  Sonar 件数: 取得できず（sonar-local.sh の出力に件数行が無い。全ログを確認）';
  const counts = `  Sonar 件数: issue ${c.issues} / hotspot ${c.hotspots}`;
  if (r.args?.includes('--area')) return counts;
  return `${counts} / Quality Gate ${c.qualityGate ?? '取得できず'}`;
}

/**
 * 結果一覧から表示用サマリを組み立てる。純関数。
 */
export function formatSummary(results, logDir) {
  const lines = [];
  for (const r of results) {
    const cmdText = r.command ? `${r.command} ${r.args.join(' ')}`.trim() : '(内部処理)';
    lines.push(`${r.status.padEnd(5)}  ${r.name}  ${r.seconds}s  ${cmdText}`);
    if (r.note) {
      lines.push(`  注記: ${r.note}`);
    }
    if (r.area === 'sonar') {
      lines.push(sonarCountsLine(r));
    }
    if (r.status === 'FAIL' && r.tail) {
      lines.push(...r.tail.split('\n').slice(-40));
    }
    if ((r.status === 'SKIP' || r.status === 'PREREQ') && r.reason) {
      lines.push(`  理由: ${r.reason}`);
    }
  }
  lines.push('');
  lines.push(`全ログの保存先: ${logDir}`);
  const code = exitCodeOf(results);
  let overall;
  if (code === 0) {
    const xfail = results.filter((r) => r.status === 'XFAIL').length;
    overall = xfail > 0 ? `PASS（想定内の失敗あり: XFAIL ${xfail} 件）` : 'PASS';
  } else {
    overall = code === 1 ? 'FAIL' : '前提不足（前提コマンドが見つからない）';
  }
  lines.push(`総合結果: ${overall}`);
  return lines.join('\n');
}

/**
 * 結果一覧から終了コードを決める。純関数。
 * FAIL があれば 1、無くて前提不足（PREREQ）があれば 2、それ以外は 0。
 * SKIP（未設定・未指定で実行しない段）と XFAIL（想定内の失敗）は 0 に数える。
 */
export function exitCodeOf(results) {
  if (results.some((r) => r.status === 'FAIL')) return 1;
  if (results.some((r) => r.status === 'PREREQ')) return 2;
  return 0;
}

function commandExists(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  if (cmd.startsWith('./') || cmd.startsWith('/')) {
    return existsSync(cmd);
  }
  const res = spawnSync(probe, [cmd], { stdio: 'ignore' });
  return res.status === 0;
}

// contracts/ 配下の *.yaml から `x-swv-status: draft` の行を `file:line` で集める。
export function scanDraftMarkers(dir = 'contracts') {
  const markers = [];
  const re = /^\s*x-swv-status:\s*draft\s*$/;
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(current, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === 'dist') continue;
        walk(full);
      } else if (name.endsWith('.yaml')) {
        const lines = readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((line, idx) => {
          if (re.test(line)) markers.push(`${full.split(path.sep).join('/')}:${idx + 1}`);
        });
      }
    }
  };
  walk(dir);
  return markers;
}

function runSchemaFreshness(step, logDir) {
  const start = Date.now();
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'swv-verify-schema-'));
  try {
    const out = path.join(tmp, 'schema.ts');
    const res = spawnSync('pnpm', ['exec', 'openapi-typescript', OPENAPI_FROM_WEB, '-o', out], {
      cwd: step.cwd,
      encoding: 'utf8',
    });
    const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    writeFileSync(path.join(logDir, 'web-contract_types-freshness.log'), output);
    const seconds = Math.round((Date.now() - start) / 1000);
    if (res.status !== 0) {
      return { ...step, status: 'FAIL', seconds, tail: `スキーマの一時生成に失敗しました。\n${output}` };
    }
    let current = null;
    try {
      current = readFileSync(SCHEMA_PATH);
    } catch {
      current = null;
    }
    const verdict = judgeFreshness(current, readFileSync(out));
    return { ...step, status: verdict.status, seconds, tail: verdict.status === 'FAIL' ? verdict.reason : undefined };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function runStep(step, logDir) {
  const start = Date.now();
  if (step.skip) {
    return { ...step, status: 'SKIP', seconds: 0, reason: step.skip };
  }
  if (step.prereqCmd && !commandExists(step.prereqCmd)) {
    return {
      ...step,
      status: 'PREREQ',
      seconds: 0,
      reason: `前提コマンドが見つかりません: ${step.prereqCmd}`,
    };
  }
  if (step.special === 'startApiAndWait') {
    return runStartApi(step, logDir);
  }
  if (step.special === 'stopApi') {
    return runStopApi(step);
  }
  if (step.special === 'schemaFreshness') {
    return runSchemaFreshness(step, logDir);
  }
  const res = spawnSync(step.command, step.args, { cwd: step.cwd, encoding: 'utf8' });
  const seconds = Math.round((Date.now() - start) / 1000);
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  const logFile = path.join(logDir, `${step.area}-${step.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}.log`);
  writeFileSync(logFile, output);
  const status = res.status === 0 ? 'PASS' : 'FAIL';
  const result = { ...step, status, seconds, tail: status === 'FAIL' ? output : undefined, logFile };
  if (step.area === 'sonar') {
    result.sonarCounts = extractSonarCounts(output);
  }
  return result;
}

let apiChildPid = null;

function runStartApi(step, logDir) {
  const start = Date.now();
  const logFile = path.join(logDir, 'e2e-api-bootrun.log');
  const child = spawnSync('bash', ['-c', `nohup ./gradlew bootRun --console=plain > "${logFile}" 2>&1 & echo $!`], {
    cwd: step.cwd,
    encoding: 'utf8',
  });
  apiChildPid = parseInt(String(child.stdout).trim(), 10) || null;
  const deadline = Date.now() + 120_000;
  let healthy = false;
  while (Date.now() < deadline) {
    const probe = spawnSync('curl', ['-sf', 'http://localhost:8080/actuator/health'], { stdio: 'ignore' });
    if (probe.status === 0) {
      healthy = true;
      break;
    }
    spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', [process.platform === 'win32' ? '/t 2' : '2']);
  }
  const seconds = Math.round((Date.now() - start) / 1000);
  return { ...step, status: healthy ? 'PASS' : 'FAIL', seconds, tail: healthy ? undefined : 'api did not become healthy in time' };
}

function runStopApi(step) {
  const start = Date.now();
  if (apiChildPid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/T', '/PID', String(apiChildPid)]);
    } else {
      spawnSync('kill', [String(apiChildPid)]);
    }
  }
  const seconds = Math.round((Date.now() - start) / 1000);
  return { ...step, status: 'PASS', seconds };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  const plan = buildPlan(options, { e2eConfigured: detectE2eConfigured() });

  console.log('実行計画:');
  for (const step of plan) {
    console.log(`- [${step.area}] ${step.name}${step.skip ? `（SKIP: ${step.skip}）` : ''}`);
  }

  if (options.dryRun) {
    process.exit(0);
  }

  const logDir = path.join(os.tmpdir(), 'swv-verify', String(Date.now()));
  mkdirSync(logDir, { recursive: true });

  const results = [];
  for (const step of plan) {
    const result = runStep(step, logDir);
    if (step.classify === 'contractTest' && (result.status === 'PASS' || result.status === 'FAIL')) {
      const verdict = classifyContractTest({
        status: result.status,
        draftMarkers: scanDraftMarkers(),
        allowDraft: options.allowDraft,
      });
      result.status = verdict.status;
      result.note = verdict.note;
      if (verdict.status === 'XFAIL') result.tail = undefined;
    }
    results.push(result);
  }

  console.log('');
  console.log(formatSummary(results, logDir));
  process.exit(exitCodeOf(results));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}

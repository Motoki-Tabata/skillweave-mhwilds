#!/usr/bin/env node
// tsod-spec-check: spec.md の数えられる条件を決定論で判定する。
// Node ESM・依存ゼロ・Node 20+。glob 照合の実装は複製せず agent-write-guard.mjs から import する。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { globToRegExp, loadScopes } from '../../impact-scope/scripts/agent-write-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCOPES_PATH = path.join(__dirname, '../../impact-scope/write-scopes.json');

const REQUIRED_SECTIONS = [
  '## 目的 / ユーザーストーリー',
  '## 受入基準（EARS記法）',
  '## スコープ外',
  '## 契約差分',
  '## 影響範囲',
  '## 依存する機能ID',
];

// 「触る領域:」の語彙。正は impact-scope/SKILL.md の「影響範囲節（spec.md）の定義」（一致は spec-check.test.mjs が検査する）。
export const AREA_VOCAB = ['api', 'web', 'solver', 'data', 'contracts', 'docker'];

function sectionLines(lines, heading) {
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function extractBacktickPaths(line) {
  const matches = [...line.matchAll(/`([^`]+)`/g)];
  return matches.map((m) => m[1]);
}

function collectBulletBlock(lines, fromIndex) {
  const bullets = [];
  for (let i = fromIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) break;
    if (/^\s*-\s+/.test(line)) {
      bullets.push(line);
    } else if (line.trim() === '') {
      // 空行は許容し続行
      continue;
    } else {
      break;
    }
  }
  return bullets;
}

/**
 * spec.md のテキストを解析する。純関数。
 */
export function parseSpec(text) {
  const lines = text.split(/\r?\n/);
  const foundSections = REQUIRED_SECTIONS.filter((h) => lines.some((l) => l.startsWith(h)));
  const missingSections = REQUIRED_SECTIONS.filter((h) => !foundSections.includes(h));

  const acceptanceLines = sectionLines(lines, '## 受入基準（EARS記法）') || [];
  const acceptanceCount = acceptanceLines.filter((l) => /^\s*(-\s+|\d+\.\s+)/.test(l)).length;

  const impactLines = sectionLines(lines, '## 影響範囲');

  let areaLine = null;
  let areas = [];
  let alwaysExcludedHeaderLine = null;
  let alwaysExcludedValue = null;
  let alwaysExcludedBullets = [];

  if (impactLines) {
    const areaIdx = impactLines.findIndex((l) => l.startsWith('触る領域:'));
    if (areaIdx !== -1) {
      areaLine = impactLines[areaIdx];
      const value = areaLine.slice('触る領域:'.length).trim();
      areas = value.length > 0 ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
    }

    const exIdx = impactLines.findIndex((l) => l.startsWith('常時許可外の変更予定:'));
    if (exIdx !== -1) {
      alwaysExcludedHeaderLine = impactLines[exIdx];
      alwaysExcludedValue = alwaysExcludedHeaderLine.slice('常時許可外の変更予定:'.length).trim();
      alwaysExcludedBullets = collectBulletBlock(impactLines, exIdx + 1);
    }
  }

  return {
    lines,
    lineCount: lines.length,
    missingSections,
    acceptanceCount,
    areaLine,
    areas,
    alwaysExcludedHeaderLine,
    alwaysExcludedValue,
    alwaysExcludedBullets,
    impactSectionFound: impactLines !== null,
  };
}

function matchesAnyRoleGlob(targetPath, scopes) {
  for (const [role, globs] of Object.entries(scopes.roles)) {
    for (const g of globs) {
      if (globToRegExp(g).test(targetPath)) {
        return role;
      }
    }
  }
  return null;
}

function checkAlwaysExcludedBullets(bullets, scopes) {
  const results = [];
  for (const bullet of bullets) {
    const paths = extractBacktickPaths(bullet);
    if (paths.length !== 1) {
      results.push({ bullet, ok: false, reason: '1行1パスではありません（バッククォート囲みのパスがちょうど1個である必要があります）' });
      continue;
    }
    const p = paths[0];
    if (/[*?[]/.test(p)) {
      results.push({ bullet, ok: false, reason: `glob 記号を含むリテラルでないパスです: ${p}` });
      continue;
    }
    const matchedRole = matchesAnyRoleGlob(p, scopes);
    if (matchedRole) {
      results.push({ bullet, ok: false, reason: `不要な記載（${matchedRole} の常時許可フォルダ内）: ${p}`, path: p });
      continue;
    }
    results.push({ bullet, ok: true, path: p });
  }
  return results;
}

/**
 * spec.md の判定を行う。純関数。scopes は write-scopes.json の内容。
 */
export function checkSpec(text, scopes) {
  const parsed = parseSpec(text);
  const rows = [];

  // 1. 必須6節
  rows.push({
    no: 1,
    item: '必須6節の在否',
    ok: parsed.missingSections.length === 0,
    note: parsed.missingSections.length === 0 ? '' : `欠落: ${parsed.missingSections.join(', ')}`,
  });

  // 2. 受入基準5〜15
  const accOk = parsed.acceptanceCount >= 5 && parsed.acceptanceCount <= 15;
  rows.push({ no: 2, item: '受入基準5〜15個', ok: accOk, note: `実測: ${parsed.acceptanceCount}個` });

  // 3. 分量目安
  const volOk = parsed.lineCount <= 150;
  rows.push({
    no: 3,
    item: '分量（目安・150行以内）',
    ok: volOk,
    note: `実測: ${parsed.lineCount}行（目安であり厳密なページ数ではない）`,
  });

  // 4. 触る領域
  let areaOk = false;
  let areaNote = '';
  if (!parsed.areaLine) {
    areaNote = '`触る領域:` 行が見当たりません';
  } else {
    const invalid = parsed.areas.filter((a) => !AREA_VOCAB.includes(a));
    const countOk = parsed.areas.length <= 3 && parsed.areas.length > 0;
    areaOk = invalid.length === 0 && countOk;
    areaNote = `実測領域: ${parsed.areas.join(', ') || '(なし)'}` + (invalid.length > 0 ? `／語彙外: ${invalid.join(', ')}` : '');
  }
  rows.push({ no: 4, item: '触る領域3つ以下・語彙適合', ok: areaOk, note: areaNote });

  // 5. 影響範囲の書式（常時許可外の変更予定・1行1パス・glob不可）
  let formatOk = false;
  let formatNote = '';
  const bulletChecks = parsed.alwaysExcludedHeaderLine ? checkAlwaysExcludedBullets(parsed.alwaysExcludedBullets, scopes) : [];
  if (!parsed.alwaysExcludedHeaderLine) {
    formatNote = '`常時許可外の変更予定:` 行が見当たりません';
  } else if (parsed.alwaysExcludedValue === 'なし') {
    formatOk = parsed.alwaysExcludedBullets.length === 0;
    formatNote = formatOk ? '「なし」・箇条書き0件' : '「なし」と書きつつ箇条書きが存在します';
  } else {
    const hasBullets = parsed.alwaysExcludedBullets.length >= 1;
    const formatIssues = bulletChecks.filter((b) => (!b.ok && b.reason.startsWith('1行1パス')) || (!b.ok && b.reason.startsWith('glob')));
    formatOk = hasBullets && formatIssues.length === 0;
    formatNote = hasBullets
      ? formatIssues.length === 0
        ? '書式OK'
        : formatIssues.map((f) => f.reason).join('／')
      : '「なし」でないのに箇条書きが0件です';
  }
  rows.push({ no: 5, item: '影響範囲の書式（1行1パス・glob不可）', ok: formatOk, note: formatNote });

  // 6. 常時許可外の妥当性
  let validityOk = true;
  let validityNote = '';
  if (parsed.alwaysExcludedHeaderLine && parsed.alwaysExcludedValue !== 'なし') {
    const invalidEntries = bulletChecks.filter((b) => !b.ok && b.reason.startsWith('不要な記載'));
    validityOk = invalidEntries.length === 0;
    validityNote = invalidEntries.length === 0 ? '妥当' : invalidEntries.map((e) => e.reason).join('／');
  } else {
    validityNote = '対象なし（「なし」または節なし）';
  }
  rows.push({ no: 6, item: '常時許可外の妥当性', ok: validityOk, note: validityNote });

  const overallOk = rows.every((r) => r.ok);
  return { parsed, rows, overallOk, bulletChecks };
}

/**
 * plan.md の「## 常時許可外の変更」節と spec.md の常時許可外パスを突合する。純関数。
 */
export function comparePlan(specResult, planText, scopes) {
  const planLines = planText.split(/\r?\n/);
  const planSection = sectionLines(planLines, '## 常時許可外の変更');
  if (planSection === null) {
    return { sectionMissing: true };
  }
  const planBullets = planSection.filter((l) => /^\s*-\s+/.test(l));
  const planChecks = checkAlwaysExcludedBullets(planBullets, scopes);
  const planPaths = new Set(planChecks.filter((c) => c.path).map((c) => c.path));

  const specPaths = new Set(
    (specResult.bulletChecks || []).filter((c) => c.path).map((c) => c.path)
  );

  const both = [...specPaths].filter((p) => planPaths.has(p));
  const planOnly = [...planPaths].filter((p) => !specPaths.has(p));
  const specOnly = [...specPaths].filter((p) => !planPaths.has(p));

  return { sectionMissing: false, both, planOnly, specOnly, planChecks };
}

/**
 * 判定結果を固定フォーマットの Markdown 表に整形する。純関数。
 */
export function formatTable(specResult, slug, compareResult) {
  const lines = [];
  lines.push(`## 薄仕様 機械判定結果（${slug}）`);
  lines.push('| # | 項目 | 判定 | 備考 |');
  lines.push('|---|---|---|---|');
  for (const r of specResult.rows) {
    lines.push(`| ${r.no} | ${r.item} | ${r.ok ? 'OK' : 'NG'} | ${r.note} |`);
  }
  lines.push('');
  lines.push(`総合: ${specResult.overallOk ? 'OK（6項目すべてOK）' : 'NG（要修正あり）'}`);

  if (compareResult) {
    lines.push('');
    lines.push('## 常時許可外の変更 突合（spec ⇔ plan）');
    if (compareResult.sectionMissing) {
      lines.push('plan.md に `## 常時許可外の変更` 節が見当たりません（判定不能）。');
    } else {
      lines.push('| 区分 | パス |');
      lines.push('|---|---|');
      for (const p of compareResult.both) lines.push(`| 両方 | \`${p}\` |`);
      for (const p of compareResult.planOnly) lines.push(`| plan のみ（ゲート C-1 で明示が必要） | \`${p}\` |`);
      for (const p of compareResult.specOnly) lines.push(`| spec のみ（plan で扱いを決める） | \`${p}\` |`);
      if (compareResult.both.length === 0 && compareResult.planOnly.length === 0 && compareResult.specOnly.length === 0) {
        lines.push('| (該当なし) | |');
      }
    }
  }

  return lines.join('\n');
}

function usageAndExit(code) {
  console.error('使い方: node spec-check.mjs <spec.md のパス> [--compare-plan <plan.md のパス>]');
  process.exit(code);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usageAndExit(2);

  const specPath = args[0];
  let comparePlanPath = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--compare-plan') {
      comparePlanPath = args[i + 1];
      i++;
    }
  }

  let scopes;
  try {
    scopes = loadScopes(SCOPES_PATH);
  } catch (err) {
    console.error(`write-scopes.json を読み込めません: ${err.message}`);
    process.exit(2);
  }

  let specText;
  try {
    specText = fs.readFileSync(specPath, 'utf8');
  } catch (err) {
    console.error(`spec.md を読み込めません: ${err.message}`);
    process.exit(2);
  }

  const slug = path.basename(path.dirname(specPath)) || path.basename(specPath);
  const specResult = checkSpec(specText, scopes);

  if (!specResult.parsed.impactSectionFound) {
    console.error('「影響範囲」節を解析できません（判定不能）。');
    process.exit(2);
  }

  let compareResult = null;
  if (comparePlanPath) {
    let planText;
    try {
      planText = fs.readFileSync(comparePlanPath, 'utf8');
    } catch (err) {
      console.error(`plan.md を読み込めません: ${err.message}`);
      process.exit(2);
    }
    compareResult = comparePlan(specResult, planText, scopes);
  }

  console.log(formatTable(specResult, slug, compareResult));

  if (compareResult && compareResult.sectionMissing) {
    process.exit(2);
  }
  process.exit(specResult.overallOk ? 0 : 1);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  main();
}

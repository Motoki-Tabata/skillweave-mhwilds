#!/usr/bin/env bash
# ローカル限定の SonarQube 解析（CI では使わない）。
#
# 使い方（リポジトリ内のどこからでも可）:
#   scripts/sonar-local.sh          # 起動 → ビルド → 解析 → 未解決の指摘を一覧表示
#   scripts/sonar-local.sh --down   # SonarQube を停止（データのボリュームは残す）
#   scripts/sonar-local.sh --area <api|web|packages> [--base <ref>]
#                                   # 領域モード: テストを再実行せず、base（既定 git merge-base HEAD main）からの
#                                   # 変更ファイルだけを別プロジェクト swv-area-<area> で解析し、新規コード
#                                   # （追加・変更行）に載る指摘だけを数える。全体の解析（swv）は変えない
#
# 終了コード: 未解決の指摘（issue + 未レビューの Security Hotspot。領域モードは新規コードのみ）が 0 件なら 0、
# 1 件以上なら 1、実行自体の失敗は 2。
#
# 前提: docker（SonarQube・スキャナに加え、apps/api テストの Testcontainers でも使う）,
# node / pnpm（apps/web・packages/* の実行環境）, JDK（apps/api の Gradle toolchain）。
#
# カバレッジ: 解析の前に apps/api（test＋contractTest → JaCoCo）と pnpm workspace（vitest coverage-v8）の
# テストを走らせ、そのレポートを取り込む。テストが失敗したら解析せずに止まる（exit 2）。
# カバレッジの値は表示するだけで、終了コードには影響しない。
# 生成物（認証情報・指摘一覧・スキャナ作業領域）はすべて .sonar-local/（gitignore 済み）に置く。
# 採用判断の経緯は design/tech-stack.md「SonarQube のローカル限定採用」節を参照。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/docker/compose.sonar.yaml")
SCANNER_IMAGE="sonarsource/sonar-scanner-cli:12.2.0.4256_8.1.0"
HOST="http://localhost:9000"
PROJECT_KEY="swv"
STATE="$ROOT/.sonar-local"

die() { echo "エラー: $*" >&2; exit 2; }

# 認証付きで API を呼ぶ。認証情報（"ユーザー:パスワード" またはトークン "値:"）は
# コマンドライン引数に載せず、curl の設定として標準入力から渡す（ps からも見えない）。
api() {
  local cred="$1"
  shift
  printf 'user = "%s"\n' "$cred" | curl -fs -K - "$@"
}

AREA=""
BASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --down)
      "${COMPOSE[@]}" down
      exit 0
      ;;
    --area)
      AREA="${2:-}"
      [[ "$AREA" == "api" || "$AREA" == "web" || "$AREA" == "packages" ]] || die "--area は api・web・packages のいずれかを指定してください"
      shift 2
      ;;
    --base)
      BASE="${2:-}"
      [[ -n "$BASE" ]] || die "--base に ref を指定してください"
      shift 2
      ;;
    *) die "不明な引数です: $1" ;;
  esac
done
[[ -z "$BASE" || -n "$AREA" ]] || die "--base は --area と一緒に指定したときだけ有効です"

command -v docker >/dev/null || die "docker が見つかりません"
command -v node >/dev/null || die "node が見つかりません"
mkdir -p "$STATE"

# --- 領域モード: 対象ファイルの確定（SonarQube を起動する前に。0 件なら起動しない） ---------
AREA_FILES=()
if [[ -n "$AREA" ]]; then
  case "$AREA" in
    api) AREA_PATHS=(apps/api/src/main apps/api/src/test) ;;
    web) AREA_PATHS=(apps/web/src/main apps/web/src/test apps/web/e2e) ;;
    packages) AREA_PATHS=(packages) ;;
  esac
  BASE="${BASE:-$(git -C "$ROOT" merge-base HEAD main)}" || die "base を決められません（--base <ref> で指定してください）"
  git -C "$ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || die "base が解決できません: $BASE"
  while IFS= read -r f; do
    if [[ -n "$f" && -f "$ROOT/$f" ]]; then AREA_FILES+=("$f"); fi
  done < <({
    git -C "$ROOT" diff --name-only --diff-filter=ACMR "$BASE" -- "${AREA_PATHS[@]}"
    git -C "$ROOT" ls-files --others --exclude-standard -- "${AREA_PATHS[@]}"
  } | sort -u)
  if [[ ${#AREA_FILES[@]} -eq 0 ]]; then
    echo "対象ファイルなし（領域: $AREA・base: $BASE）"
    echo "未解決: issue 0 件 / 未レビュー hotspot 0 件（領域: $AREA・新規コードのみ。詳細: .sonar-local/issues-$AREA.json）"
    exit 0
  fi
  exec 9>"$STATE/area-$AREA.lock"
  flock -n 9 || die "領域 $AREA の解析がすでに実行中です（.sonar-local/area-$AREA.lock）。終わってから再実行してください"
fi

# --- 1. 起動と起動待ち --------------------------------------------------------
"${COMPOSE[@]}" up -d >/dev/null
echo "SonarQube の起動を待っています..."
for _ in $(seq 1 90); do
  if curl -fs "$HOST/api/system/status" | grep -q '"status":"UP"'; then
    break
  fi
  sleep 2
done
curl -fs "$HOST/api/system/status" | grep -q '"status":"UP"' || die "SonarQube が起動しませんでした（docker logs swv_sonarqube を確認）"

# --- 2. 認証（初回のみ admin パスワード変更とトークン発行） ------------------------
token_valid() {
  [[ -s "$STATE/token" ]] &&
    api "$(cat "$STATE/token"):" "$HOST/api/authentication/validate" | grep -q '"valid":true'
}

if ! token_valid; then
  password=""
  if [[ -s "$STATE/admin-password" ]] &&
    api "admin:$(cat "$STATE/admin-password")" "$HOST/api/authentication/validate" | grep -q '"valid":true'; then
    password="$(cat "$STATE/admin-password")"
  else
    # 初回起動直後は admin/admin。ローカル専用のランダム値へ変更して保存する。
    new_password="$(node -e 'process.stdout.write("Aa1!" + require("crypto").randomBytes(18).toString("hex"))')"
    api "admin:admin" -X POST "$HOST/api/users/change_password" \
      --data-urlencode "login=admin" \
      --data-urlencode "previousPassword=admin" \
      --data-urlencode "password=$new_password" >/dev/null ||
      die "admin の認証に失敗しました。ボリュームを作り直す場合は: docker compose -f docker/compose.sonar.yaml down -v && rm -rf .sonar-local"
    (umask 077 && printf '%s' "$new_password" >"$STATE/admin-password")
    password="$new_password"
  fi
  token_name="sonar-local-$(date +%Y%m%d%H%M%S)"
  token="$(api "admin:$password" -X POST "$HOST/api/user_tokens/generate" \
    --data-urlencode "name=$token_name" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token))')" ||
    die "トークンの発行に失敗しました"
  (umask 077 && printf '%s' "$token" >"$STATE/token")
fi
TOKEN="$(cat "$STATE/token")"

# --- 領域モード: ビルドと解析、新規コードの指摘だけを数える（テストは走らせない） ----------
if [[ -n "$AREA" ]]; then
  AREA_PROJECT="swv-area-$AREA"
  AREA_WORK="$STATE/scannerwork-$AREA"
  SRC_INC=()
  TEST_INC=()
  for f in "${AREA_FILES[@]}"; do
    if [[ "$f" == */src/main/* ]]; then SRC_INC+=("$f"); else TEST_INC+=("$f"); fi
  done
  join_csv() { local IFS=,; echo "$*"; }
  NONE="__no-such-file__"
  SRC_INCLUSIONS="$NONE"
  TEST_INCLUSIONS="$NONE"
  if [[ ${#SRC_INC[@]} -gt 0 ]]; then SRC_INCLUSIONS="$(join_csv "${SRC_INC[@]}")"; fi
  if [[ ${#TEST_INC[@]} -gt 0 ]]; then TEST_INCLUSIONS="$(join_csv "${TEST_INC[@]}")"; fi

  SCAN_ARGS=(
    -Dsonar.projectBaseDir="$ROOT"
    -Dsonar.projectKey="$AREA_PROJECT"
    -Dsonar.projectName="skillweave-mhwilds ($AREA)"
    -Dsonar.working.directory="$AREA_WORK"
    '-Dsonar.coverage.exclusions=**/*'
    -Dsonar.inclusions="$SRC_INCLUSIONS"
    -Dsonar.test.inclusions="$TEST_INCLUSIONS"
  )
  DOCKER_MOUNTS=(-v "$ROOT:$ROOT")
  if [[ "$AREA" == "api" ]]; then
    # コンパイルと classpath の書き出しだけ（sonarClasspath はテストに依存しない）
    (cd "$ROOT/apps/api" && ./gradlew -q classes testClasses sonarClasspath) || die "apps/api のビルドが失敗しました"
    SONAR_BUILD="$ROOT/apps/api/build/sonar"
    JDK_HOME="$(cat "$SONAR_BUILD/jdk-home.txt")"
    DOCKER_MOUNTS+=(-v "$HOME/.gradle:$HOME/.gradle:ro" -v "$JDK_HOME:$JDK_HOME:ro")
    SCAN_ARGS+=(
      -Dsonar.sources=apps/api/src/main
      -Dsonar.tests=apps/api/src/test
      -Dsonar.java.binaries=apps/api/build/classes/java/main
      -Dsonar.java.test.binaries=apps/api/build/classes/java/test
      -Dsonar.java.libraries="$(cat "$SONAR_BUILD/main-classpath.txt")"
      -Dsonar.java.test.libraries="$(cat "$SONAR_BUILD/test-classpath.txt")"
      -Dsonar.java.jdkHome="$JDK_HOME"
    )
  elif [[ "$AREA" == "web" ]]; then
    SCAN_ARGS+=(
      -Dsonar.sources=apps/web/src/main
      -Dsonar.tests=apps/web/src/test
    )
  else
    SCAN_ARGS+=(
      -Dsonar.sources=packages/solver/src/main,packages/data/src/main
      -Dsonar.tests=packages/solver/src/test,packages/data/src/test
    )
  fi

  rm -f "$AREA_WORK/report-task.txt"
  docker run --rm --network host \
    -u "$(id -u):$(id -g)" \
    -e SONAR_HOST_URL="$HOST" \
    -e SONAR_TOKEN="$TOKEN" \
    -e SONAR_USER_HOME="$STATE/scanner-home" \
    "${DOCKER_MOUNTS[@]}" \
    -w "$ROOT" \
    "$SCANNER_IMAGE" \
    "${SCAN_ARGS[@]}" ||
    die "スキャナが失敗しました"

  ce_task_id="$(sed -n 's/^ceTaskId=//p' "$AREA_WORK/report-task.txt")"
  [[ -n "$ce_task_id" ]] || die "report-task.txt に ceTaskId がありません"
  ce_status=""
  for _ in $(seq 1 150); do
    ce_status="$(api "$TOKEN:" "$HOST/api/ce/task?id=$ce_task_id" |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).task.status))')"
    [[ "$ce_status" == "SUCCESS" || "$ce_status" == "FAILED" || "$ce_status" == "CANCELED" ]] && break
    sleep 2
  done
  [[ "$ce_status" == "SUCCESS" ]] || die "サーバー側の解析が完了しませんでした（status=$ce_status）"

  # 新規コード = base からの追加・変更行（git diff -U0）。base に無い新規ファイルは全行。
  SONAR_TOKEN="$TOKEN" node - "$HOST" "$AREA_PROJECT" "$STATE" "$AREA" "$ROOT" "$BASE" "${AREA_FILES[@]}" <<'NODE'
const [host, project, state, area, root, base, ...files] = process.argv.slice(2);
const { execFileSync } = require("child_process");
const fs = require("fs");
const auth = "Basic " + Buffer.from(process.env.SONAR_TOKEN + ":").toString("base64");

function changedLines(file) {
  try {
    execFileSync("git", ["-C", root, "cat-file", "-e", `${base}:${file}`], { stdio: "ignore" });
  } catch {
    return null; // 新規ファイル: 全行が新規コード
  }
  const out = execFileSync("git", ["-C", root, "diff", "-U0", base, "--", file], { encoding: "utf8" });
  const ranges = [];
  for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0) ranges.push([start, start + len - 1]);
  }
  return ranges;
}
const changed = new Map(files.map((f) => [f, changedLines(f)]));
const inNew = (file, line) => {
  if (!changed.has(file)) return false;
  const ranges = changed.get(file);
  if (ranges === null) return true;
  if (line == null) return false;
  return ranges.some(([a, b]) => line >= a && line <= b);
};

async function fetchAll(path, key) {
  const items = [];
  for (let p = 1; ; p++) {
    const res = await fetch(`${host}${path}&ps=500&p=${p}`, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    const body = await res.json();
    items.push(...body[key]);
    if (items.length >= body.paging.total || body[key].length === 0) return items;
  }
}

(async () => {
  const file = (c) => c.replace(`${project}:`, "");
  const issues = (await fetchAll(`/api/issues/search?components=${project}&issueStatuses=OPEN,CONFIRMED`, "issues")).filter(
    (i) => inNew(file(i.component), i.line),
  );
  const hotspots = (await fetchAll(`/api/hotspots/search?project=${project}&status=TO_REVIEW`, "hotspots")).filter(
    (h) => inNew(file(h.component), h.line),
  );
  fs.writeFileSync(`${state}/issues-${area}.json`, JSON.stringify({ issues, hotspots }, null, 2));
  const rows = [
    ...issues.map((i) => [i.rule, `${file(i.component)}:${i.line ?? "-"}`, i.message]),
    ...hotspots.map((h) => [`hotspot:${h.ruleKey}`, `${file(h.component)}:${h.line ?? "-"}`, h.message]),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  for (const r of rows) console.log(r.join("\t"));
  console.log(
    `\n未解決: issue ${issues.length} 件 / 未レビュー hotspot ${hotspots.length} 件（領域: ${area}・新規コードのみ。詳細: .sonar-local/issues-${area}.json）`,
  );
  process.exit(rows.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error(`エラー: ${e.message}`);
  process.exit(2);
});
NODE
  exit $?
fi

# --- 3. テスト（カバレッジ計測）・ビルドと classpath の書き出し ----------------------
(cd "$ROOT/apps/api" && ./gradlew -q test contractTest jacocoTestReport classes testClasses sonarClasspath) ||
  die "apps/api のテストまたはビルドが失敗しました"
(cd "$ROOT" && pnpm -s test:coverage >/dev/null) ||
  die "pnpm workspace のテストが失敗しました（リポジトリ直下で pnpm test:coverage を実行して詳細を確認）"
SONAR_BUILD="$ROOT/apps/api/build/sonar"
JDK_HOME="$(cat "$SONAR_BUILD/jdk-home.txt")"

# --- 4. 解析 ---------------------------------------------------------------------
# classpath・JDK は絶対パスのため、同じパスでコンテナへマウントする。
rm -f "$STATE/scannerwork/report-task.txt"
docker run --rm --network host \
  -u "$(id -u):$(id -g)" \
  -e SONAR_HOST_URL="$HOST" \
  -e SONAR_TOKEN="$TOKEN" \
  -e SONAR_USER_HOME="$STATE/scanner-home" \
  -v "$ROOT:$ROOT" \
  -v "$HOME/.gradle:$HOME/.gradle:ro" \
  -v "$JDK_HOME:$JDK_HOME:ro" \
  -w "$ROOT" \
  "$SCANNER_IMAGE" \
  -Dsonar.projectBaseDir="$ROOT" \
  -Dsonar.working.directory="$STATE/scannerwork" \
  -Dsonar.java.binaries=apps/api/build/classes/java/main \
  -Dsonar.java.test.binaries=apps/api/build/classes/java/test \
  -Dsonar.java.libraries="$(cat "$SONAR_BUILD/main-classpath.txt")" \
  -Dsonar.java.test.libraries="$(cat "$SONAR_BUILD/test-classpath.txt")" \
  -Dsonar.java.jdkHome="$JDK_HOME" ||
  die "スキャナが失敗しました"

# --- 5. サーバー側の集計完了を待つ ------------------------------------------------
ce_task_id="$(sed -n 's/^ceTaskId=//p' "$STATE/scannerwork/report-task.txt")"
[[ -n "$ce_task_id" ]] || die "report-task.txt に ceTaskId がありません"
ce_status=""
for _ in $(seq 1 150); do
  ce_status="$(api "$TOKEN:" "$HOST/api/ce/task?id=$ce_task_id" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).task.status))')"
  [[ "$ce_status" == "SUCCESS" || "$ce_status" == "FAILED" || "$ce_status" == "CANCELED" ]] && break
  sleep 2
done
[[ "$ce_status" == "SUCCESS" ]] || die "サーバー側の解析が完了しませんでした（status=$ce_status）"

# --- 6. 未解決の指摘を取得・表示 ----------------------------------------------------
SONAR_TOKEN="$TOKEN" node - "$HOST" "$PROJECT_KEY" "$STATE" <<'NODE'
const [host, project, state] = process.argv.slice(2);
const auth = "Basic " + Buffer.from(process.env.SONAR_TOKEN + ":").toString("base64");
const fs = require("fs");

async function fetchAll(path, key) {
  const items = [];
  for (let p = 1; ; p++) {
    const res = await fetch(`${host}${path}&ps=500&p=${p}`, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    const body = await res.json();
    items.push(...body[key]);
    if (items.length >= body.paging.total || body[key].length === 0) return items;
  }
}

(async () => {
  const issues = await fetchAll(`/api/issues/search?components=${project}&issueStatuses=OPEN,CONFIRMED`, "issues");
  const hotspots = await fetchAll(`/api/hotspots/search?project=${project}&status=TO_REVIEW`, "hotspots");
  const measuresRes = await fetch(
    `${host}/api/measures/component?component=${project}&metricKeys=coverage,line_coverage,branch_coverage`,
    { headers: { Authorization: auth } },
  );
  if (!measuresRes.ok) throw new Error(`/api/measures/component -> HTTP ${measuresRes.status}`);
  const measures = Object.fromEntries(
    (await measuresRes.json()).component.measures.map((m) => [m.metric, `${m.value}%`]),
  );
  // 既定の Quality Gate「Sonar way」は new_coverage（新規コードのカバレッジ）≥80% を含む。
  // design/tech-stack.md「カバレッジのローカル計測」節のとおり、これを正式基準として表示する
  // （全体値は参考表示のみでゲートにしない。終了コードは変えない）。
  const gateRes = await fetch(`${host}/api/qualitygates/project_status?projectKey=${project}`, {
    headers: { Authorization: auth },
  });
  if (!gateRes.ok) throw new Error(`/api/qualitygates/project_status -> HTTP ${gateRes.status}`);
  const gate = (await gateRes.json()).projectStatus;
  const newCoverage = gate.conditions.find((c) => c.metricKey === "new_coverage");
  fs.writeFileSync(`${state}/issues.json`, JSON.stringify({ issues, hotspots }, null, 2));

  const file = (c) => c.replace(`${project}:`, "");
  const rows = [
    ...issues.map((i) => [i.rule, `${file(i.component)}:${i.line ?? "-"}`, i.message]),
    ...hotspots.map((h) => [`hotspot:${h.ruleKey}`, `${file(h.component)}:${h.line ?? "-"}`, h.message]),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  for (const r of rows) console.log(r.join("\t"));

  const byRule = {};
  for (const r of rows) byRule[r[0]] = (byRule[r[0]] ?? 0) + 1;
  console.log("\n--- ルール別件数 ---");
  for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.log(`${n}\t${rule}`);
  console.log(
    `\nカバレッジ（参考値・ゲートではない）: 全体 ${measures.coverage ?? "-"} / 行 ${measures.line_coverage ?? "-"} / 分岐 ${measures.branch_coverage ?? "-"}`,
  );
  if (newCoverage) {
    console.log(
      `Quality Gate: ${gate.status}（新規コードのカバレッジ ${newCoverage.actualValue}% / 基準 ${newCoverage.errorThreshold}%以上。正式基準。design/tech-stack.md 参照）`,
    );
  }
  console.log(`未解決: issue ${issues.length} 件 / 未レビュー hotspot ${hotspots.length} 件（詳細: .sonar-local/issues.json、画面: ${host}/dashboard?id=${project}）`);
  process.exit(rows.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error(`エラー: ${e.message}`);
  process.exit(2);
});
NODE

package io.github.motokitabata.skillweave.contract;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.swagger.parser.OpenAPIParser;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.parser.core.models.ParseOptions;
import io.swagger.v3.parser.core.models.SwaggerParseResult;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * {@code contracts/openapi.yaml}（正）と springdoc の実行時出力（実装）を突合する。
 *
 * <p>全文一致ではなく、実害の大きい2点に絞って比較する（contracts/README.md 参照）。
 *
 * <ol>
 *   <li>パス × HTTP メソッド × operationId の集合</li>
 *   <li>operationId ごとのレスポンス status code の集合</li>
 * </ol>
 *
 * <p>{@code x-swv-status: draft} が付いた契約側オペレーションは未実装であることを
 * 表すため、突合対象から除外する。これにより実装より先に契約を書ける
 * （契約ファーストを機械的に成立させる仕掛け）。逆に実装が完了したのに {@code draft}
 * を外し忘れた場合は {@link #draftOperationsMustNotBeImplemented()} が検出する。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@Import(TestcontainersConfiguration.class)
@Tag("contract")
class OpenApiContractTest {

    private static final String DRAFT_MARKER = "x-swv-status";
    private static final String DRAFT_VALUE = "draft";

    @Autowired
    private TestRestTemplate restTemplate;

    private static OpenAPI contract;

    @BeforeAll
    static void loadContract() {
        String contractsDir = System.getProperty("swv.contracts.dir");
        assertThat(contractsDir)
                .as("swv.contracts.dir システムプロパティが未設定です（build.gradle.kts の contractTest タスク参照）")
                .isNotBlank();

        Path openApiPath = Path.of(contractsDir, "openapi.yaml");
        contract = parse(openApiPath.toUri().toString());
    }

    @Test
    void pathsAndOperationIdsMatchImplementation() {
        Set<String> implKeys = operationKeys(implementation(), false);
        Set<String> contractKeys = operationKeys(contract, true);

        assertThat(implKeys)
                .as("実装(springdoc の /v3/api-docs)と契約(contracts/openapi.yaml)のパス×メソッド×operationIdが一致しません")
                .isEqualTo(contractKeys);
    }

    @Test
    void responseStatusCodesMatchImplementation() {
        Map<String, Set<String>> implStatuses = responseStatusesByOperationId(implementation(), false);
        Map<String, Set<String>> contractStatuses = responseStatusesByOperationId(contract, true);

        assertThat(implStatuses)
                .as("operationId ごとのレスポンス status code が実装と契約で一致しません")
                .isEqualTo(contractStatuses);
    }

    /**
     * 契約側で {@code x-swv-status: draft} が付いたままのオペレーションが、実装側
     * （springdoc の {@code /v3/api-docs}）にパス×メソッドとして存在していないかを検証する。
     *
     * <p>{@code draft} は「未実装」を表す契約ファーストの仕掛けであり、実装が完了したら
     * 外す運用（{@code contracts/README.md}「{@code x-swv-status: draft} の意味」節）。
     * 外し忘れると上の2テストは {@code draft} を除外したまま green になり、契約と実装の
     * ズレを検出できなくなる。この状態そのものを本テストで検出する。
     */
    @Test
    void draftOperationsMustNotBeImplemented() {
        Set<String> draftKeys = pathMethodKeys(contract, true);
        Set<String> implementedKeys = pathMethodKeys(implementation(), false);

        Set<String> implementedButStillDraft = new TreeSet<>(draftKeys);
        implementedButStillDraft.retainAll(implementedKeys);

        assertThat(implementedButStillDraft)
                .as(
                        "実装が存在するのに contracts/paths/**/*.yaml 側で x-swv-status: draft が残っています。"
                                + "実装が完了したオペレーションからは draft マーカーを外してください: %s",
                        implementedButStillDraft)
                .isEmpty();
    }

    // ---- fixtures ----

    private OpenAPI implementation() {
        String apiDocsJson = restTemplate.getForObject("/v3/api-docs", String.class);
        return parse(apiDocsJson);
    }

    private static OpenAPI parse(String locationOrContent) {
        ParseOptions options = new ParseOptions();
        options.setResolve(true);
        // setResolve(true) は外部ファイル参照（contracts/paths/**/*.yaml -> components/**/*.yaml）は
        // 解決するが、同一ドキュメント内参照（#/components/schemas/... 形式。springdoc の
        // /v3/api-docs はこの形式）は解決しない。プロパティ抽出のため両方を完全展開する。
        options.setResolveFully(true);

        SwaggerParseResult result = locationOrContent.trim().startsWith("{")
                ? new OpenAPIParser().readContents(locationOrContent, null, options)
                : new OpenAPIParser().readLocation(locationOrContent, null, options);

        assertThat(result.getMessages())
                .as("OpenAPI のパースでエラーが発生しました: %s", result.getMessages())
                .isEmpty();
        OpenAPI openApi = result.getOpenAPI();
        assertThat(openApi).as("OpenAPI のパース結果が null です").isNotNull();
        return openApi;
    }

    // ---- extraction helpers ----

    private static Set<String> operationKeys(OpenAPI api, boolean excludeDraft) {
        Set<String> keys = new TreeSet<>();
        forEachOperation(
                api, excludeDraft, (path, method, op) -> keys.add(method + " " + path + " -> " + op.getOperationId()));
        return keys;
    }

    /**
     * {@code "METHOD path"} 形式のキー集合を返す（{@link #operationKeys} と異なり
     * {@code operationId} を含めない）。draft 回収検出では、契約と実装で operationId が
     * 食い違っていても「実装が存在する」こと自体を見たいため、path × method だけで比較する。
     *
     * @param draftOnly true なら draft が付いたオペレーションのみを対象にする
     */
    private static Set<String> pathMethodKeys(OpenAPI api, boolean draftOnly) {
        Set<String> keys = new TreeSet<>();
        forEachOperation(api, false, (path, method, op) -> {
            if (draftOnly && !isDraft(op)) {
                return;
            }
            keys.add(method + " " + path);
        });
        return keys;
    }

    private static Map<String, Set<String>> responseStatusesByOperationId(OpenAPI api, boolean excludeDraft) {
        Map<String, Set<String>> result = new LinkedHashMap<>();
        forEachOperation(api, excludeDraft, (path, method, op) -> {
            if (op.getResponses() != null) {
                result.put(op.getOperationId(), new TreeSet<>(op.getResponses().keySet()));
            }
        });
        return result;
    }

    @FunctionalInterface
    private interface OperationVisitor {
        void visit(String path, String method, Operation operation);
    }

    private static void forEachOperation(OpenAPI api, boolean excludeDraft, OperationVisitor visitor) {
        if (api.getPaths() == null) {
            return;
        }
        api.getPaths()
                .forEach((path, pathItem) -> pathItem.readOperationsMap().forEach((method, operation) -> {
                    if (excludeDraft && isDraft(operation)) {
                        return;
                    }
                    visitor.visit(path, method.name(), operation);
                }));
    }

    private static boolean isDraft(Operation operation) {
        return operation.getExtensions() != null
                && DRAFT_VALUE.equals(operation.getExtensions().get(DRAFT_MARKER));
    }
}

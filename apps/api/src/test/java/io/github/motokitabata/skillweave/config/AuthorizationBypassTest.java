package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.net.URI;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

/** 認可の規則（SecurityConfig・plan D7）と迂回のテスト（エンコードしたパス・HEAD）。受入基準 10, 14。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class AuthorizationBypassTest {

    private static final String PROBLEM_JSON = "application/problem+json";

    @Autowired
    private TestRestTemplate rest;

    private ResponseEntity<String> exchange(HttpMethod method, String path) {
        return rest.exchange(URI.create(rest.getRootUri() + path), method, null, String.class);
    }

    private int status(HttpMethod method, String path) {
        return exchange(method, path).getStatusCode().value();
    }

    // 認証不要の入口は認証なしで通る（GET・HEAD とも）。
    @ParameterizedTest
    @ValueSource(strings = {"/actuator/health", "/actuator/info", "/v3/api-docs"})
    void publicEndpointsAreReachableWithoutLogin(String path) {
        assertThat(status(HttpMethod.GET, path) / 100).isEqualTo(2);
        assertThat(status(HttpMethod.HEAD, path) / 100).isEqualTo(2);
    }

    // 受入基準 10: デコードすると /api/auth/me になるパスは、GET・HEAD のどちらでも 401 の problem+json
    // （認可の規則が先に働き、/error への ERROR ディスパッチに化けない）。
    @ParameterizedTest
    @ValueSource(strings = {"/api/auth/me", "/api/%61uth/me", "/api/auth/me/"})
    void decodedProtectedPathsReturn401Problem(String path) {
        ResponseEntity<String> get = exchange(HttpMethod.GET, path);
        assertThat(get.getStatusCode().value()).isEqualTo(401);
        assertThat(get.getHeaders().getContentType().toString()).startsWith(PROBLEM_JSON);
        assertThat(get.getBody()).contains("\"status\":401").doesNotContain("\"instance\":\"/error\"");

        ResponseEntity<String> head = exchange(HttpMethod.HEAD, path);
        assertThat(head.getStatusCode().value()).isEqualTo(401);
        assertThat(head.getHeaders().getContentType().toString()).startsWith(PROBLEM_JSON);
    }

    // 受入基準 10: 保護されたパスの下の他のパスも、GET・HEAD とも 401。
    @ParameterizedTest
    @ValueSource(
            strings = {
                "/api/anything-else",
                "/api/auth/me/extra",
                "/api/shared-builds",
                "/api/shared-builds/x/extra",
                "/api/shares",
                "/api/shares/01900000-0001-7000-8000-000000000001"
            })
    void otherProtectedPathsReturn401(String path) {
        assertThat(status(HttpMethod.GET, path)).isEqualTo(401);
        assertThat(status(HttpMethod.HEAD, path)).isEqualTo(401);
    }

    // 012 AC-11: 閲覧の API は GET・HEAD だけ未ログインで通り（共有が無ければ 404）、管理の API と
    // ID なし・1 段より深いパスは未ログインでは 401。
    @ParameterizedTest
    @ValueSource(strings = {"/api/shared-builds/Ab3dE6gH9jK2", "/api/shared-builds/x"})
    void sharedBuildViewIsPublicForGetAndHead(String path) {
        assertThat(status(HttpMethod.GET, path)).isEqualTo(404);
        assertThat(status(HttpMethod.HEAD, path)).isEqualTo(404);
    }

    // 012 AC-11: 閲覧のパス（有効な短縮 ID の形・エンコードした形）への未ログインの POST・DELETE は、
    // CSRF トークン付きなら 401（閲覧の permitAll が GET・HEAD に限られること）、トークンが無ければ
    // CSRF フィルターが認可より先に働いて 403（どちらも通さない）。
    @ParameterizedTest
    @ValueSource(strings = {"/api/shared-builds/Ab3dE6gH9jK2", "/api/shared-builds/%41b3dE6gH9jK2"})
    void sharedBuildViewRejectsMutationsWithoutLogin(String path) {
        HttpHeaders withToken = new HttpHeaders();
        withToken.add(HttpHeaders.COOKIE, "XSRF-TOKEN=x");
        withToken.add("X-XSRF-TOKEN", "x");
        for (HttpMethod method : new HttpMethod[] {HttpMethod.POST, HttpMethod.DELETE}) {
            URI uri = URI.create(rest.getRootUri() + path);
            assertThat(rest.exchange(uri, method, new HttpEntity<>(withToken), String.class)
                            .getStatusCode()
                            .value())
                    .as("%s %s with CSRF token", method, path)
                    .isEqualTo(401);
            assertThat(rest.exchange(uri, method, new HttpEntity<>(new HttpHeaders()), String.class)
                            .getStatusCode()
                            .value())
                    .as("%s %s without CSRF token", method, path)
                    .isEqualTo(403);
        }
    }

    // ファイアウォールが拒む形（%2F・/./・/../）は、認可の前に 400 で拒否される（GET・HEAD とも）。
    @ParameterizedTest
    @ValueSource(strings = {"/api/auth%2Fme", "/api/./auth/me", "/api/../api/auth/me", "/actuator/health/../env"})
    void firewallRejectedPathsReturn400(String path) {
        assertThat(status(HttpMethod.GET, path)).isEqualTo(400);
        assertThat(status(HttpMethod.HEAD, path)).isEqualTo(400);
    }

    // 認証不要の一覧に無いパス（/api の外・大文字違い・非公開のアクチュエーター）は、
    // 未ログインでは匿名の denyAll で 401 の problem+json（404 は認可を通ったときだけ返る）。
    @ParameterizedTest
    @ValueSource(strings = {"/API/auth/me", "/unknown", "/actuator/env", "/actuator/%65nv"})
    void unlistedPathsReturn401Problem(String path) {
        ResponseEntity<String> get = exchange(HttpMethod.GET, path);
        assertThat(get.getStatusCode().value()).isEqualTo(401);
        assertThat(get.getHeaders().getContentType().toString()).startsWith(PROBLEM_JSON);

        assertThat(status(HttpMethod.HEAD, path)).isEqualTo(401);
    }
}

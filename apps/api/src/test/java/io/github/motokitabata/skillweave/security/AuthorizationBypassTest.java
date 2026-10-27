package io.github.motokitabata.skillweave.security;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.net.URI;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;

/** 認可の規則（plan D7）と迂回のテスト（エンコードしたパス・HEAD）。受入基準 10, 14。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class AuthorizationBypassTest {

    @Autowired
    private TestRestTemplate rest;

    private HttpStatusCode status(HttpMethod method, String path) {
        ResponseEntity<String> r = rest.exchange(URI.create(rest.getRootUri() + path), method, null, String.class);
        return r.getStatusCode();
    }

    // 認証不要の入口は認証なしで通る（GET・HEAD とも）。
    @ParameterizedTest
    @ValueSource(strings = {"/actuator/health", "/actuator/info", "/v3/api-docs"})
    void publicEndpointsAreReachableWithoutLogin(String path) {
        assertThat(status(HttpMethod.GET, path).is2xxSuccessful()).isTrue();
        assertThat(status(HttpMethod.HEAD, path).is2xxSuccessful()).isTrue();
    }

    // 受入基準 10: 保護されたパスは GET・HEAD・エンコードしたパスのどれでも 401。
    @ParameterizedTest
    @ValueSource(
            strings = {
                "/api/auth/me",
                "/api/%61uth/me",
                "/api/auth%2Fme",
                "/api/auth/me/",
                "/api/./auth/me",
                "/api/anything-else",
                "/API/auth/me"
            })
    void protectedPathsRejectUnauthenticatedRequests(String path) {
        assertThat(status(HttpMethod.GET, path).value()).isIn(400, 401, 403, 404);
        assertThat(status(HttpMethod.GET, path).value()).isNotEqualTo(200);
        assertThat(status(HttpMethod.HEAD, path).value()).isNotEqualTo(200);
    }

    @Test
    void headOnMeIsUnauthorized() {
        assertThat(status(HttpMethod.HEAD, "/api/auth/me").value()).isEqualTo(401);
    }

    // 認証不要の一覧に無いパスは拒否する（非公開のアクチュエーターなど）。
    @ParameterizedTest
    @ValueSource(strings = {"/actuator/env", "/actuator/%65nv", "/unknown", "/actuator/health/../env"})
    void unlistedPathsAreDenied(String path) {
        assertThat(status(HttpMethod.GET, path).value()).isIn(400, 401, 403, 404);
        assertThat(status(HttpMethod.GET, path).is2xxSuccessful()).isFalse();
    }
}

package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** ERROR ディスパッチ（/error）を permitAll にする認可の規則（SecurityConfig・plan D7）のテスト。受入基準 10。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({TestcontainersConfiguration.class, ErrorDispatchAuthorizationTest.ErrorProbeController.class})
@FakeDiscordCredentials
class ErrorDispatchAuthorizationTest {

    private static final String BOOM = "/api/test/boom";
    private static final String BOOM_ERROR = "/api/test/send-error";

    /** 例外を投げる経路と sendError する経路を持つ（テストだけに存在する）。 */
    @RestController
    static class ErrorProbeController {
        @GetMapping(BOOM)
        String boom() {
            throw new IllegalStateException("boom");
        }

        @GetMapping(BOOM_ERROR)
        void sendError(HttpServletResponse response) throws IOException {
            response.sendError(500, "send-error");
        }
    }

    @LocalServerPort
    private int port;

    @MockitoBean
    private OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;

    @MockitoBean
    private DiscordUserFetcher fetcher;

    private DiscordHttp http;

    @BeforeEach
    void setUpHttp() {
        http = new DiscordHttp(port, tokenClient, fetcher);
    }

    // ERROR ディスパッチ（/error）は permitAll で、元のステータスを変えない（ログイン中・未ログインとも）。
    @Test
    void errorStatusesAreNotRewrittenByErrorDispatch() throws Exception {
        String session = http.login("200000000000000010");

        assertThat(http.get("/api/does-not-exist", session).status()).isEqualTo(404);
        assertThat(http.get(BOOM, session).status()).isEqualTo(500);
        assertThat(http.get(BOOM_ERROR, session).status()).isEqualTo(500);
        // 規則に無いパスは denyAll（REQUEST）で 403。/error への直接の要求も同じ
        assertThat(http.get("/unknown", session).status()).isEqualTo(403);
        assertThat(http.get("/error", session).status()).isEqualTo(403);
        // 未ログインの保護パスは、存在しなくても 401（認可が先）
        assertThat(http.get("/api/does-not-exist", null).status()).isEqualTo(401);
        assertThat(http.get(BOOM, null).status()).isEqualTo(401);
    }
}

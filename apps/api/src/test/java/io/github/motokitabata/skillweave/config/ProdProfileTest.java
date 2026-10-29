package io.github.motokitabata.skillweave.config;

import static io.github.motokitabata.skillweave.support.DiscordHttp.cookieValue;
import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.DiscordHttp.Res;
import io.github.motokitabata.skillweave.support.DiscordHttp.Started;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.session.jdbc.autoconfigure.JdbcSessionProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 本番プロファイル（028 api-prod-config の AC-1, 2, 4, 5, 6, 11, 12）。実際の HTTP（http）で行い、
 * 要求が http に見えても Secure が付くことを確かめる。Discord には接続しない。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
@ActiveProfiles("prod")
@TestPropertySource(
        properties = {
            "DISCORD_REDIRECT_URI=https://swv.example/api/login/oauth2/code/discord",
            "SWV_WEB_TOP_URL=https://swv.example/"
        })
class ProdProfileTest {

    private static final String SESSION = "SESSION";
    private static final String XSRF = "XSRF-TOKEN";
    private static final String ME = "/api/auth/me";
    private static final String LOGOUT = "/api/auth/logout";
    private static final String AUTHORIZE = "/api/oauth2/authorization/discord";
    private static final String SECURE = "Secure";
    private static final String CODE_AND_STATE = "code=abc&state=";

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcSessionProperties jdbcSessionProperties;

    @MockitoBean
    private OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;

    @MockitoBean
    private DiscordUserFetcher fetcher;

    private DiscordHttp http;

    @BeforeEach
    void setUpHttp() {
        http = new DiscordHttp(port, tokenClient, fetcher);
    }

    private static boolean hasAttribute(String setCookie, String attribute) {
        return Arrays.stream(setCookie.split(";")).map(String::trim).anyMatch(attribute::equalsIgnoreCase);
    }

    // AC-1: 要求が http でも、認可の開始とログイン後の SESSION に Secure が付く。
    @Test
    void sessionCookieIsSecureEvenOverHttp() throws Exception {
        http.stubDiscord(Map.of("id", "290000000000000001", "username", "hunter", "global_name", "狩人太郎"));
        Res authorize = http.get(AUTHORIZE, null);
        Started started = http.startAuthorization();
        Res callback = http.callback(started, CODE_AND_STATE + started.state());

        assertThat(hasAttribute(authorize.setCookie(SESSION), SECURE)).isTrue();
        assertThat(callback.status()).isEqualTo(302);
        assertThat(hasAttribute(callback.setCookie(SESSION), SECURE)).isTrue();
    }

    // AC-2: XSRF-TOKEN に Secure が付き、HttpOnly は付かない。
    @Test
    void xsrfCookieIsSecureAndNotHttpOnly() throws Exception {
        String session = http.login("290000000000000002");

        String xsrf = http.get(ME, session).setCookie(XSRF);

        assertThat(xsrf).isNotNull();
        assertThat(hasAttribute(xsrf, SECURE)).isTrue();
        assertThat(hasAttribute(xsrf, "HttpOnly")).isFalse();
    }

    // AC-4: health は構成要素の詳細を含めず、liveness・readiness は応答する。
    @Test
    void healthHidesComponentsButProbesRespond() throws Exception {
        Res health = http.get("/actuator/health", null);

        assertThat(health.status()).isEqualTo(200);
        assertThat(health.body()).contains("UP").doesNotContain("components").doesNotContain("details");
        assertThat(http.get("/actuator/health/liveness", null).status()).isEqualTo(200);
        assertThat(http.get("/actuator/health/readiness", null).status()).isEqualTo(200);
    }

    // AC-5: API の定義を返さない（404）。
    @ParameterizedTest
    @ValueSource(strings = {"/v3/api-docs", "/swagger-ui.html", "/swagger-ui/index.html"})
    void apiDocsAreNotServed(String path) throws Exception {
        assertThat(http.get(path, null).status()).isEqualTo(404);
    }

    // AC-6: redirect URI とログイン後の戻り先を環境変数から受け取る。
    @Test
    void redirectUriAndWebTopComeFromEnvironment() throws Exception {
        http.stubDiscord(Map.of("id", "290000000000000003", "username", "hunter", "global_name", "狩人太郎"));
        Res authorize = http.get(AUTHORIZE, null);
        Started started = http.startAuthorization();
        Res callback = http.callback(started, CODE_AND_STATE + started.state());

        assertThat(UriComponentsBuilder.fromUriString(authorize.header("Location"))
                        .build()
                        .getQueryParams()
                        .getFirst("redirect_uri"))
                .isEqualTo("https://swv.example/api/login/oauth2/code/discord");
        assertThat(callback.header("Location")).isEqualTo("https://swv.example/");
    }

    // AC-11: 本番でも掃除は毎日 3:00（UTC）の1回。
    @Test
    void cleanupCronIsDailyInProd() {
        assertThat(jdbcSessionProperties.getCleanupCron()).isEqualTo("0 0 3 * * *");
    }

    // AC-12: 本番でもログイン・me・CSRF 付きのログアウト・401 の挙動は変わらない。
    @Test
    void authFlowBehavesTheSameInProd() throws Exception {
        assertThat(http.get(ME, null).status()).isEqualTo(401);
        String session = http.login("290000000000000004");
        Res me = http.get(ME, session);
        assertThat(me.status()).isEqualTo(200);
        String xsrf = cookieValue(me.setCookie(XSRF));

        Res logout = http.send("POST", LOGOUT, SESSION + "=" + session + "; " + XSRF + "=" + xsrf, xsrf);

        assertThat(logout.status()).isEqualTo(204);
        assertThat(http.get(ME, session).status()).isEqualTo(401);
    }
}

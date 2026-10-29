package io.github.motokitabata.skillweave.security;

import static io.github.motokitabata.skillweave.support.DiscordHttp.cookieValue;
import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.DiscordHttp.Res;
import io.github.motokitabata.skillweave.support.DiscordHttp.Started;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.session.jdbc.autoconfigure.JdbcSessionProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * セッションの方針（028 api-prod-config の AC-3, 5, 8, 9, 10, 11）。既定のプロファイル（本番でない）で行う。
 * 実際の HTTP で行う（AuthFlowTest と同じ理由）。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class SessionPolicyTest {

    private static final String SESSION = "SESSION";
    private static final String XSRF = "XSRF-TOKEN";
    private static final String ME = "/api/auth/me";
    private static final String AUTHORIZE = "/api/oauth2/authorization/discord";
    private static final int TEN_MINUTES = 600;
    private static final int THIRTY_DAYS = 2592000;

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

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

    private int maxInactiveInterval(String cookieValue) {
        String id = new String(Base64.getDecoder().decode(cookieValue), StandardCharsets.UTF_8);
        Integer seconds = jdbc.queryForObject(
                "SELECT max_inactive_interval FROM spring_session WHERE session_id = ?", Integer.class, id);
        assertThat(seconds).isNotNull();
        return seconds;
    }

    private static boolean hasAttribute(String setCookie, String attribute) {
        return Arrays.stream(setCookie.split(";")).map(String::trim).anyMatch(attribute::equalsIgnoreCase);
    }

    // AC-3: 本番でないとき、SESSION・XSRF-TOKEN に Secure を付けない（http のローカルで動く）。
    @Test
    void cookiesHaveNoSecureAttributeOutsideProd() throws Exception {
        http.stubDiscord(Map.of("id", "280000000000000001", "username", "hunter", "global_name", "狩人太郎"));
        Started started = http.startAuthorization();
        Res authorize = http.get(AUTHORIZE, null);
        Res callback = http.callback(started, "code=abc&state=" + started.state());
        String session = cookieValue(callback.setCookie(SESSION));
        Res me = http.get(ME, session);

        assertThat(hasAttribute(authorize.setCookie(SESSION), "Secure")).isFalse();
        assertThat(hasAttribute(callback.setCookie(SESSION), "Secure")).isFalse();
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.setCookie(XSRF)).isNotNull();
        assertThat(hasAttribute(me.setCookie(XSRF), "Secure")).isFalse();
    }

    // AC-5: 本番プロファイルが無効なときは、Swagger UI を今までどおり返す（404 にならない）。
    @Test
    void swaggerUiIsServedOutsideProd() throws Exception {
        Res res = http.get("/swagger-ui.html", null);

        assertThat(res.status()).isBetween(200, 399);
    }

    // AC-8: 未ログインで認可を始めたセッションの有効期間は 10 分。
    @Test
    void anonymousAuthorizationStartShortensSession() throws Exception {
        Started started = http.startAuthorization();

        assertThat(maxInactiveInterval(started.sessionCookie())).isEqualTo(TEN_MINUTES);
    }

    // AC-9: 認可を始めたセッションでログインに成功すると、有効期間が 30 日に戻る。
    @Test
    void successfulLoginRestoresSessionTimeout() throws Exception {
        http.stubDiscord(Map.of("id", "280000000000000002", "username", "hunter", "global_name", "狩人太郎"));
        Started started = http.startAuthorization();
        assertThat(maxInactiveInterval(started.sessionCookie())).isEqualTo(TEN_MINUTES);

        Res callback = http.callback(started, "code=abc&state=" + started.state());

        assertThat(callback.status()).isEqualTo(302);
        assertThat(maxInactiveInterval(cookieValue(callback.setCookie(SESSION))))
                .isEqualTo(THIRTY_DAYS);
    }

    // AC-10: ログイン済みのセッションで認可を始めても、有効期間を短くしない。
    @Test
    void authorizationStartWhileLoggedInKeepsSessionTimeout() throws Exception {
        String session = http.login("280000000000000003");
        assertThat(maxInactiveInterval(session)).isEqualTo(THIRTY_DAYS);

        Res res = http.get(AUTHORIZE, session);

        assertThat(res.status()).isEqualTo(302);
        assertThat(maxInactiveInterval(session)).isEqualTo(THIRTY_DAYS);
    }

    // AC-11: 期限切れセッションの掃除は毎日 3:00（UTC）の1回。
    @Test
    void cleanupCronRunsOnceADayAtThreeAm() {
        assertThat(jdbcSessionProperties.getCleanupCron()).isEqualTo("0 0 3 * * *");
    }
}

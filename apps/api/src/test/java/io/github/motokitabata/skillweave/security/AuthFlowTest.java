package io.github.motokitabata.skillweave.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Discord ログインの API の振る舞い（受入基準 1, 2, 3, 4, 6, 7, 8, 9, 10, 14）。
 * 実際の Discord には接続せず、トークンの取得とユーザー情報の取得を差し替える。
 *
 * <p>MockMvc ではなく実際の HTTP（組み込み Tomcat）で行う。MockMvc の環境では Spring Boot が
 * {@code server.servlet.session.cookie.*} を Spring Session の Cookie に適用しないため。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class AuthFlowTest {

    private static final String SESSION = "SESSION";
    private static final String XSRF = "XSRF-TOKEN";
    private static final String ME = "/api/auth/me";
    private static final String LOGOUT = "/api/auth/logout";
    private static final String AUTHORIZE = "/api/oauth2/authorization/discord";
    private static final String CALLBACK = "/api/login/oauth2/code/discord";
    private static final String THIRTY_DAYS = "Max-Age=2592000";
    private static final String CODE_AND_STATE = "code=abc&state=";

    @LocalServerPort
    private int port;

    @Value("${swv.auth.web-top-url}")
    private String webTopUrl;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;

    @MockitoBean
    private DiscordUserFetcher fetcher;

    private final HttpClient client =
            HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

    private record Res(int status, HttpResponse<String> raw) {
        String header(String name) {
            return raw.headers().firstValue(name).orElse(null);
        }

        String body() {
            return raw.body();
        }

        /** 同じ名前が複数あるときは最後（ブラウザが採用する）。 */
        String setCookie(String name) {
            String found = null;
            for (String h : raw.headers().allValues("set-cookie")) {
                if (h.startsWith(name + "=")) {
                    found = h;
                }
            }
            return found;
        }
    }

    private Res send(String method, String path, String cookies, String xsrfHeader) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(method, HttpRequest.BodyPublishers.noBody());
        if (cookies != null) {
            b.header("Cookie", cookies);
        }
        if (xsrfHeader != null) {
            b.header("X-XSRF-TOKEN", xsrfHeader);
        }
        HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return new Res(r.statusCode(), r);
    }

    private Res get(String path, String sessionValue) throws Exception {
        return send("GET", path, sessionValue == null ? null : SESSION + "=" + sessionValue, null);
    }

    private static String cookieValue(String setCookie) {
        int end = setCookie.indexOf(';') < 0 ? setCookie.length() : setCookie.indexOf(';');
        String pair = setCookie.substring(0, end);
        return pair.substring(pair.indexOf('=') + 1);
    }

    private record Started(String sessionCookie, String state) {}

    private Started startAuthorization() throws Exception {
        Res res = get(AUTHORIZE, null);
        String state = UriComponentsBuilder.fromUriString(res.header("Location"))
                .build()
                .getQueryParams()
                .getFirst("state");
        return new Started(cookieValue(res.setCookie(SESSION)), state);
    }

    private void stubDiscord(Map<String, Object> userInfo) {
        when(tokenClient.getTokenResponse(any()))
                .thenReturn(OAuth2AccessTokenResponse.withToken("t")
                        .tokenType(OAuth2AccessToken.TokenType.BEARER)
                        .expiresIn(60)
                        .build());
        when(fetcher.fetch(any())).thenReturn(userInfo);
    }

    private Res callback(Started started, String query) throws Exception {
        // Host は localhost:{port} で、redirect-uri（localhost:5173）と違う（plan D2）
        return get(CALLBACK + "?" + query, started.sessionCookie());
    }

    /** ログインを最後まで通し、確立したセッションの Cookie 値を返す。 */
    private String login(String discordId) throws Exception {
        stubDiscord(Map.of("id", discordId, "username", "hunter", "global_name", "狩人太郎"));
        Started started = startAuthorization();
        return cookieValue(callback(started, CODE_AND_STATE + started.state()).setCookie(SESSION));
    }

    private static String sessionId(String cookieValue) {
        return new String(Base64.getDecoder().decode(cookieValue), StandardCharsets.UTF_8);
    }

    private int sessionRows(String cookieValue) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM spring_session WHERE session_id = ?", Integer.class, sessionId(cookieValue));
        return n == null ? 0 : n;
    }

    // 受入基準 1: Discord の認可へ遷移し、スコープは identify だけ。
    @Test
    void authorizationRedirectsToDiscordWithIdentifyScopeOnly() throws Exception {
        Res res = get(AUTHORIZE, null);

        assertThat(res.status()).isEqualTo(302);
        var location =
                UriComponentsBuilder.fromUriString(res.header("Location")).build();
        assertThat(location.getHost()).isEqualTo("discord.com");
        assertThat(location.getPath()).isEqualTo("/oauth2/authorize");
        assertThat(location.getQueryParams().getFirst("scope")).isEqualTo("identify");
        assertThat(location.getQueryParams().getFirst("response_type")).isEqualTo("code");
        assertThat(location.getQueryParams().getFirst("redirect_uri"))
                .isEqualTo("http://localhost:5173/api/login/oauth2/code/discord");
    }

    // 受入基準 2, 3, 8: 戻りでユーザーが作られ、固定の URL へリダイレクトし、セッションが JDBC に保存される。
    // Host が redirect-uri と違う戻りでも成功する（plan D2）。
    @Test
    void callbackCreatesUserRedirectsToWebTopAndPersistsSession() throws Exception {
        String discordId = "200000000000000001";
        stubDiscord(Map.of("id", discordId, "username", "hunter", "global_name", "狩人太郎"));
        Started started = startAuthorization();

        Res res = callback(started, CODE_AND_STATE + started.state());

        assertThat(res.status()).isEqualTo(302);
        assertThat(res.header("Location")).isEqualTo(webTopUrl);
        Integer users =
                jdbc.queryForObject("SELECT count(*) FROM users WHERE discord_id = ?", Integer.class, discordId);
        assertThat(users).isEqualTo(1);
        String session = cookieValue(res.setCookie(SESSION));
        assertThat(sessionRows(session)).isEqualTo(1);
        // 別の要求から（Cookie だけで）読める
        Res me = get(ME, session);
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.body()).contains("\"displayName\":\"狩人太郎\"");
    }

    // 受入基準 3: 戻り先を要求のパラメータで受け取らない。
    @Test
    void redirectTargetIsFixedEvenIfRequestCarriesOne() throws Exception {
        stubDiscord(Map.of("id", "200000000000000002", "username", "u"));
        Started started = startAuthorization();

        Res res = callback(started, CODE_AND_STATE + started.state() + "&continue=https://evil.example/");

        assertThat(res.header("Location")).isEqualTo(webTopUrl);
    }

    // 受入基準 4: 拒否でセッションを確立せず、同じ URL へリダイレクトする。
    @Test
    void deniedAuthorizationDoesNotEstablishSession() throws Exception {
        Started started = startAuthorization();

        Res res = callback(started, "error=access_denied&state=" + started.state());

        assertThat(res.status()).isEqualTo(302);
        assertThat(res.header("Location")).isEqualTo(webTopUrl);
        assertThat(sessionRows(started.sessionCookie())).isZero();
        assertThat(get(ME, started.sessionCookie()).status()).isEqualTo(401);
    }

    // 受入基準 4: ユーザー情報が不正でもセッションを確立しない。
    @Test
    void invalidUserInfoDoesNotEstablishSession() throws Exception {
        stubDiscord(Map.of("id", "not-a-number", "username", "u"));
        Started started = startAuthorization();

        Res res = callback(started, CODE_AND_STATE + started.state());

        assertThat(res.header("Location")).isEqualTo(webTopUrl);
        assertThat(sessionRows(started.sessionCookie())).isZero();
        assertThat(get(ME, started.sessionCookie()).status()).isEqualTo(401);
    }

    // 受入基準 10: 未ログインの me・logout は 401（Discord へリダイレクトしない）。
    @Test
    void unauthenticatedMeAndLogoutReturn401ProblemWithoutRedirect() throws Exception {
        List<Res> results = new ArrayList<>();
        results.add(get(ME, null));
        results.add(send("POST", LOGOUT, XSRF + "=x", "x"));

        for (Res r : results) {
            assertThat(r.status()).isEqualTo(401);
            assertThat(r.header("Location")).isNull();
            assertThat(r.header("Content-Type")).startsWith("application/problem+json");
            assertThat(r.body()).contains("\"status\":401");
        }
    }

    // 受入基準 8: me の 200 の応答で XSRF-TOKEN の Cookie が発行される（JS から読める）。
    @Test
    void meIssuesXsrfTokenCookie() throws Exception {
        String session = login("200000000000000003");

        Res me = get(ME, session);

        assertThat(me.status()).isEqualTo(200);
        assertThat(me.setCookie(XSRF)).isNotNull().doesNotContain("HttpOnly");
    }

    // 受入基準 7: CSRF トークンの無いログアウトは 403 で拒否し、セッションを残す。
    @Test
    void logoutWithoutCsrfIsForbiddenAndKeepsSession() throws Exception {
        String session = login("200000000000000004");

        Res res = send("POST", LOGOUT, SESSION + "=" + session, null);

        assertThat(res.status()).isEqualTo(403);
        assertThat(sessionRows(session)).isEqualTo(1);
        assertThat(get(ME, session).status()).isEqualTo(200);
    }

    // 受入基準 6: CSRF トークン付きのログアウトは 204 で、セッションの行を消し、Cookie を失効させる。
    @Test
    void logoutWithCsrfDeletesSessionAndExpiresCookie() throws Exception {
        String session = login("200000000000000005");
        String xsrf = cookieValue(get(ME, session).setCookie(XSRF));

        Res res = send("POST", LOGOUT, SESSION + "=" + session + "; " + XSRF + "=" + xsrf, xsrf);

        assertThat(res.status()).isEqualTo(204);
        assertThat(sessionRows(session)).isZero();
        assertThat(res.setCookie(SESSION)).contains("Max-Age=0");
        assertThat(get(ME, session).status()).isEqualTo(401);
    }

    // 受入基準 9: Cookie は HttpOnly・SameSite=Lax・30 日。使い続けると書き直されて最後の利用から数える。
    @Test
    void sessionCookieAttributesAndSlidingRefresh() throws Exception {
        stubDiscord(Map.of("id", "200000000000000006", "username", "u"));
        Started started = startAuthorization();
        Res loginRes = callback(started, CODE_AND_STATE + started.state());
        String issued = loginRes.setCookie(SESSION);

        assertThat(issued)
                .contains("HttpOnly")
                .contains("SameSite=Lax")
                .contains(THIRTY_DAYS)
                .doesNotContain("Secure");

        String refreshed = get(ME, cookieValue(issued)).setCookie(SESSION);
        assertThat(refreshed)
                .isNotNull()
                .contains("HttpOnly")
                .contains("SameSite=Lax")
                .contains(THIRTY_DAYS);
        assertThat(cookieValue(refreshed)).isEqualTo(cookieValue(issued));
    }

    // 受入基準 9: セッションの有効期間は 30 日（DB 上の最大無操作時間）。
    @Test
    void sessionTimeoutIsThirtyDays() throws Exception {
        String session = login("200000000000000007");

        Integer seconds = jdbc.queryForObject(
                "SELECT max_inactive_interval FROM spring_session WHERE session_id = ?",
                Integer.class,
                sessionId(session));

        assertThat(seconds).isEqualTo(30 * 24 * 60 * 60);
    }
}

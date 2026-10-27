package io.github.motokitabata.skillweave.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 実際の HTTP（組み込み Tomcat）で Discord ログインを通す補助。トークンの取得とユーザー情報の取得は
 * 呼び出し側が {@code @MockitoBean} で差し替えたものを渡す。実際の Discord には接続しない。
 */
public class DiscordHttp {

    public static final String SESSION = "SESSION";
    private static final String AUTHORIZE = "/api/oauth2/authorization/discord";
    private static final String CALLBACK = "/api/login/oauth2/code/discord";

    private final int port;
    private final OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;
    private final DiscordUserFetcher fetcher;
    private final HttpClient client =
            HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

    public DiscordHttp(
            int port,
            OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient,
            DiscordUserFetcher fetcher) {
        this.port = port;
        this.tokenClient = tokenClient;
        this.fetcher = fetcher;
    }

    public record Res(int status, HttpResponse<String> raw) {
        public String header(String name) {
            return raw.headers().firstValue(name).orElse(null);
        }

        public String body() {
            return raw.body();
        }

        /** 同じ名前の Set-Cookie は 1 つの応答に高々 1 本であること。無ければ null。 */
        public String setCookie(String name) {
            List<String> found = raw.headers().allValues("set-cookie").stream()
                    .filter(h -> h.startsWith(name + "="))
                    .toList();
            assertThat(found).as("Set-Cookie: %s", name).hasSizeLessThanOrEqualTo(1);
            return found.isEmpty() ? null : found.get(0);
        }
    }

    public record Started(String sessionCookie, String state) {}

    public Res send(String method, String path, String cookies, String xsrfHeader) throws Exception {
        return sendJson(method, path, cookies, xsrfHeader, null);
    }

    /** JSON の本文を載せて送る。{@code jsonBody} が null なら本文なし。 */
    public Res sendJson(String method, String path, String cookies, String xsrfHeader, String jsonBody)
            throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(
                        method,
                        jsonBody == null
                                ? HttpRequest.BodyPublishers.noBody()
                                : HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8));
        if (jsonBody != null) {
            b.header("Content-Type", "application/json");
        }
        if (cookies != null) {
            b.header("Cookie", cookies);
        }
        if (xsrfHeader != null) {
            b.header("X-XSRF-TOKEN", xsrfHeader);
        }
        HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return new Res(r.statusCode(), r);
    }

    public Res get(String path, String sessionValue) throws Exception {
        return send("GET", path, sessionValue == null ? null : SESSION + "=" + sessionValue, null);
    }

    public static String cookieValue(String setCookie) {
        int end = setCookie.indexOf(';') < 0 ? setCookie.length() : setCookie.indexOf(';');
        String pair = setCookie.substring(0, end);
        return pair.substring(pair.indexOf('=') + 1);
    }

    public Started startAuthorization() throws Exception {
        Res res = get(AUTHORIZE, null);
        String state = UriComponentsBuilder.fromUriString(res.header("Location"))
                .build()
                .getQueryParams()
                .getFirst("state");
        return new Started(cookieValue(res.setCookie(SESSION)), state);
    }

    public void stubDiscord(Map<String, Object> userInfo) {
        when(tokenClient.getTokenResponse(any()))
                .thenReturn(OAuth2AccessTokenResponse.withToken("t")
                        .tokenType(OAuth2AccessToken.TokenType.BEARER)
                        .expiresIn(60)
                        .build());
        when(fetcher.fetch(any())).thenReturn(userInfo);
    }

    public Res callback(Started started, String query) throws Exception {
        // Host は localhost:{port} で、redirect-uri（localhost:5173）と違う（plan D2）
        return get(CALLBACK + "?" + query, started.sessionCookie());
    }

    /** ログインを最後まで通し、確立したセッションの Cookie 値を返す。 */
    public String login(String discordId) throws Exception {
        stubDiscord(Map.of("id", discordId, "username", "hunter", "global_name", "狩人太郎"));
        Started started = startAuthorization();
        return cookieValue(
                callback(started, "code=abc&state=" + started.state()).setCookie(SESSION));
    }
}

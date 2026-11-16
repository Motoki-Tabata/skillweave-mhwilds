package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.SkillweaveApplication;
import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * 起動時のセッション掃除（040 session-cleanup の AC-1, AC-2）。1 つ目のアプリの掃除は行を作る前に済んでいるため、
 * 同じ DB を指す 2 つ目のアプリを起動して「起動のたびに」掃除されることを確かめる。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class SessionStartupCleanupIntegrationTest {

    private static final String ME = "/api/auth/me";

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PostgreSQLContainer postgres;

    @MockitoBean
    private OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;

    @MockitoBean
    private DiscordUserFetcher fetcher;

    private static String sessionId(String cookieValue) {
        return new String(Base64.getDecoder().decode(cookieValue), StandardCharsets.UTF_8);
    }

    private int sessionRows(String id) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM spring_session WHERE session_id = ?", Integer.class, id);
        return n == null ? -1 : n;
    }

    private int attributeRows(String id) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM spring_session_attributes a JOIN spring_session s"
                        + " ON a.session_primary_id = s.primary_id WHERE s.session_id = ?",
                Integer.class,
                id);
        return n == null ? -1 : n;
    }

    private void expire(String id) {
        jdbc.update(
                "UPDATE spring_session SET expiry_time = ? WHERE session_id = ?",
                System.currentTimeMillis() - 60_000,
                id);
    }

    // AC-1: 起動のたびに、期限切れのセッション（ログイン済み・未ログインで認可を始めたもの）の行を消す。
    // AC-2: 期限の切れていないセッションの行は残り、その Cookie で /api/auth/me が 200 を返す。
    @Test
    void startupRemovesExpiredSessionsAndKeepsLiveOnes() throws Exception {
        DiscordHttp http = new DiscordHttp(port, tokenClient, fetcher);
        String cookieA = http.login("290000000000000001");
        String cookieB = http.login("290000000000000002");
        String cookieC = http.startAuthorization().sessionCookie();
        String a = sessionId(cookieA);
        String b = sessionId(cookieB);
        String c = sessionId(cookieC);
        assertThat(http.get(ME, cookieA).status()).isEqualTo(200);
        expire(b);
        expire(c);
        assertThat(attributeRows(b)).isPositive();
        assertThat(attributeRows(c)).isPositive();

        try (ConfigurableApplicationContext second = SkillweaveApplication.application()
                .run(
                        "--server.port=0",
                        "--spring.datasource.url=" + postgres.getJdbcUrl(),
                        "--spring.datasource.username=" + postgres.getUsername(),
                        "--spring.datasource.password=" + postgres.getPassword(),
                        "--DISCORD_CLIENT_ID=test-client",
                        "--DISCORD_CLIENT_SECRET=test-secret")) {
            int secondPort = Integer.parseInt(second.getEnvironment().getProperty("local.server.port"));

            assertThat(sessionRows(b)).isZero();
            assertThat(attributeRows(b)).isZero();
            assertThat(sessionRows(c)).isZero();
            assertThat(attributeRows(c)).isZero();
            assertThat(sessionRows(a)).isEqualTo(1);
            assertThat(new DiscordHttp(secondPort, tokenClient, fetcher)
                            .get(ME, cookieA)
                            .status())
                    .isEqualTo(200);
        }
    }
}

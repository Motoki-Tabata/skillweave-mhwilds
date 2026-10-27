package io.github.motokitabata.skillweave;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.security.DiscordCredentialsValidator;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Docker（PostgreSQL）→ Flyway → アプリ起動の縦の疎通を確認するスモークテスト。
 * Testcontainers 上で実行する（H2 は使わない）。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureTestRestTemplate
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class SmokeTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ApplicationContext context;

    @Test
    void healthEndpointReportsUp() {
        ResponseEntity<String> response = restTemplate.getForEntity("/actuator/health", String.class);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody()).contains("\"status\":\"UP\"");
    }

    // 受入基準 13: 認証情報の検証がアプリに組み込まれている（SecurityConfig の bean が消えたら落ちる）。
    @Test
    void discordCredentialsValidatorIsRegistered() {
        assertThat(context.getBeansOfType(DiscordCredentialsValidator.class)).hasSize(1);
    }

    @Test
    void databaseIsPostgreSql18() {
        Integer versionNum = jdbcTemplate.queryForObject("SHOW server_version_num", Integer.class);

        assertThat(versionNum).isNotNull().isGreaterThanOrEqualTo(180000);
    }
}

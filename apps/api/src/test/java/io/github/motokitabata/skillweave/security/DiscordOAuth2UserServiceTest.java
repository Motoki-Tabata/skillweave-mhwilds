package io.github.motokitabata.skillweave.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** 受入基準 2（ユーザーの作成と再利用）・14（API のテスト）。 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class DiscordOAuth2UserServiceTest {

    @Autowired
    private DiscordOAuth2UserService service;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private DiscordUserFetcher fetcher;

    private int count(String discordId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM users WHERE discord_id = ?", Integer.class, discordId);
        return n == null ? 0 : n;
    }

    private DiscordUserPrincipal login(Map<String, Object> attributes) {
        when(fetcher.fetch(any())).thenReturn(attributes);
        OAuth2User user = service.loadUser(null);
        return (DiscordUserPrincipal) user;
    }

    // 受入基準 2: 初回で1行でき、2回目で同じ ID が返り行が増えず、値が変わらない。
    @Test
    void firstLoginCreatesAndSecondLoginReusesWithoutChangingRow() {
        String discordId = "100000000000000001";
        Map<String, Object> attrs = Map.of("id", discordId, "username", "hunter", "global_name", "狩人");

        DiscordUserPrincipal first = login(attrs);
        String updatedAtFirst =
                jdbc.queryForObject("SELECT updated_at::text FROM users WHERE discord_id = ?", String.class, discordId);
        DiscordUserPrincipal second = login(attrs);
        String updatedAtSecond =
                jdbc.queryForObject("SELECT updated_at::text FROM users WHERE discord_id = ?", String.class, discordId);

        assertThat(second.userId()).isEqualTo(first.userId());
        assertThat(count(discordId)).isEqualTo(1);
        assertThat(updatedAtSecond).isEqualTo(updatedAtFirst);
        assertThat(first.userId().version()).isEqualTo(7);
    }

    // 受入基準 2: 表示名は global_name、空か無ければ username。メールと表示名は DB に書かない。
    @Test
    void displayNameFallsBackToUsernameAndNothingElseIsPersisted() {
        DiscordUserPrincipal blank =
                login(Map.of("id", "100000000000000002", "username", "hunter2", "global_name", " ", "email", "a@b.c"));
        DiscordUserPrincipal absent = login(Map.of("id", "100000000000000003", "username", "hunter3"));

        assertThat(blank.displayName()).isEqualTo("hunter2");
        assertThat(absent.displayName()).isEqualTo("hunter3");
        List<String> columns = jdbc.queryForList(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'", String.class);
        assertThat(columns).containsExactlyInAnyOrder("id", "discord_id", "created_at", "updated_at");
    }

    // 受入基準 2: 同じ Discord ユーザーの初回ログインが同時に来ても重複も失敗もしない。
    @Test
    void concurrentFirstLoginsYieldOneRow() throws Exception {
        String discordId = "100000000000000004";
        Map<String, Object> attrs = Map.of("id", discordId, "username", "racer");
        when(fetcher.fetch(any())).thenReturn(attrs);
        int threads = 8;
        CountDownLatch start = new CountDownLatch(1);
        List<Future<UUID>> futures = new ArrayList<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return ((DiscordUserPrincipal) service.loadUser(null)).userId();
                }));
            }
            start.countDown();
            Set<UUID> ids = new HashSet<>();
            for (Future<UUID> f : futures) {
                ids.add(f.get());
            }
            assertThat(ids).hasSize(1);
        }
        assertThat(count(discordId)).isEqualTo(1);
    }

    // 受入基準 2: Discord の ID の形式が合わなければ認証の失敗にする。
    @Test
    void invalidDiscordIdIsAuthenticationFailure() {
        when(fetcher.fetch(any())).thenReturn(Map.of("id", "12ab", "username", "x"));
        OAuth2UserRequest request = null;

        assertThatThrownBy(() -> service.loadUser(request)).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(count("12ab")).isZero();
    }
}

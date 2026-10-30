package io.github.motokitabata.skillweave.controller;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.DiscordHttp.Res;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 共有の管理の API（012 build-share。受入基準 AC-1, 2, 3, 4, 7, 9, 12, 14）。
 * 実際の HTTP（組み込み Tomcat）で、ログインの Cookie と CSRF トークンを付けて呼ぶ。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class ShareControllerTest {

    private static final String SHARES = "/api/shares";
    private static final String BUILDS = "/api/builds";
    private static final String XSRF = "x";
    private static final String NAME = "鉄刀【神楽】 構成3";
    private static final String SHORT_ID_PATTERN = "[0-9A-Za-z]{12}";
    private static final String PAYLOAD = "{\"weapon\":{\"kind\":\"master\",\"weaponId\":\"wp:charge-blade:22\"},"
            + "\"armor\":{\"head\":null,\"chest\":null,\"arms\":null,\"waist\":null,\"legs\":null},\"charm\":null,"
            + "\"decorations\":[],\"skills\":[{\"skillId\":\"sk:1\",\"level\":3,\"rawLevel\":4}],\"freeSlots\":[],"
            + "\"activeConditionIds\":[\"cd:weak_point\"]}";
    private static final long BASE_MILLIS = 0x0190_0000_0000L;

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper mapper;

    @MockitoBean
    private OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;

    @MockitoBean
    private DiscordUserFetcher fetcher;

    private DiscordHttp http;
    private String alice;
    private String bob;

    @BeforeEach
    void setUp() throws Exception {
        http = new DiscordHttp(port, tokenClient, fetcher);
        clean();
        alice = cookies(http.login("400000000000000001"));
        bob = cookies(http.login("400000000000000002"));
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM shares");
        jdbc.update("DELETE FROM builds");
    }

    private static String cookies(String session) {
        return DiscordHttp.SESSION + "=" + session + "; XSRF-TOKEN=" + XSRF;
    }

    /** 連番から決定的な UUIDv7。n が大きいほど ID は大きい。 */
    private static UUID id(long n) {
        return new UUID(((BASE_MILLIS + n) << 16) | 0x7000L, 0x8000_0000_0000_0000L | n);
    }

    private Res call(String method, String path, String cookies, String body) throws Exception {
        return http.sendJson(method, path, cookies, cookies == null ? null : XSRF, body);
    }

    private void createBuild(String cookies, UUID id, String name) throws Exception {
        String body = "{\"id\":\"" + id + "\",\"name\":\"" + name + "\",\"masterVersion\":\"2026.10.4\",\"payload\":"
                + PAYLOAD + ",\"schemaVersion\":1}";
        assertThat(call("POST", BUILDS, cookies, body).status()).isEqualTo(201);
    }

    private Res share(String cookies, UUID id, UUID buildId) throws Exception {
        return call("POST", SHARES, cookies, "{\"id\":\"" + id + "\",\"buildId\":\"" + buildId + "\"}");
    }

    private JsonNode json(Res res) {
        return mapper.readTree(res.body());
    }

    private long shareRows() {
        Long n = jdbc.queryForObject("SELECT count(*) FROM shares", Long.class);
        return n == null ? 0 : n;
    }

    private boolean revoked(UUID id) {
        Boolean b = jdbc.queryForObject("SELECT deleted_at IS NOT NULL FROM shares WHERE id = ?", Boolean.class, id);
        return Boolean.TRUE.equals(b);
    }

    // AC-1, AC-14: 構成の行から写した共有を 201 で作る。要求に name・payload を足しても行の値が入る。
    @Test
    void createCopiesFromBuildRow() throws Exception {
        createBuild(alice, id(1), NAME);
        String body = "{\"id\":\"" + id(10) + "\",\"buildId\":\"" + id(1)
                + "\",\"name\":\"改ざん\",\"payload\":{},\"masterVersion\":\"9.9.9\"}";

        Res res = call("POST", SHARES, alice, body);

        assertThat(res.status()).isEqualTo(201);
        JsonNode s = json(res);
        assertThat(s.propertyNames()).containsExactlyInAnyOrder("id", "shortId", "buildId", "name", "createdAt");
        assertThat(s.get("id").asString()).isEqualTo(id(10).toString());
        assertThat(s.get("buildId").asString()).isEqualTo(id(1).toString());
        assertThat(s.get("name").asString()).isEqualTo(NAME);
        assertThat(s.get("shortId").asString()).matches(SHORT_ID_PATTERN);
        assertThat(jdbc.queryForObject("SELECT master_version FROM shares WHERE id = ?", String.class, id(10)))
                .isEqualTo("2026.10.4");
        assertThat(jdbc.queryForObject("SELECT schema_version FROM shares WHERE id = ?", Integer.class, id(10)))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "SELECT payload->'skills'->0->>'skillId' FROM shares WHERE id = ?", String.class, id(10)))
                .isEqualTo("sk:1");
    }

    // AC-3: 有効な共有がある構成での 2 回目の作成は、既存の共有を 200 で返し、行を増やさない。
    @Test
    void createReturnsExistingActiveShare() throws Exception {
        createBuild(alice, id(1), NAME);
        JsonNode first = json(share(alice, id(10), id(1)));

        Res second = share(alice, id(11), id(1));

        assertThat(second.status()).isEqualTo(200);
        assertThat(json(second)).isEqualTo(first);
        assertThat(shareRows()).isEqualTo(1);
    }

    // AC-4: 元の構成が無い・削除済み・他のユーザーの構成は 404 で、行を作らない。
    @Test
    void createWithoutOwnLiveBuildIsNotFound() throws Exception {
        createBuild(alice, id(1), NAME);
        createBuild(bob, id(2), NAME);
        createBuild(alice, id(3), NAME);
        call("DELETE", BUILDS + "/" + id(3), alice, null);

        assertThat(share(alice, id(10), id(99)).status()).isEqualTo(404);
        assertThat(share(alice, id(11), id(2)).status()).isEqualTo(404);
        assertThat(share(alice, id(12), id(3)).status()).isEqualTo(404);
        assertThat(shareRows()).isZero();
    }

    // AC-4: ID が自分・他のユーザー・取り消し済みの行と衝突したら 409 で、既存の行を変えない。
    @Test
    void createWithCollidingIdIsConflict() throws Exception {
        createBuild(alice, id(1), NAME);
        createBuild(alice, id(2), NAME);
        createBuild(bob, id(3), NAME);
        createBuild(alice, id(4), NAME);
        share(alice, id(10), id(1));
        share(bob, id(11), id(3));
        share(alice, id(12), id(4));
        call("DELETE", SHARES + "/" + id(12), alice, null);

        assertThat(share(alice, id(10), id(2)).status()).isEqualTo(409);
        assertThat(share(alice, id(11), id(2)).status()).isEqualTo(409);
        assertThat(share(alice, id(12), id(2)).status()).isEqualTo(409);
        assertThat(shareRows()).isEqualTo(3);
    }

    // AC-4: 要求の構造の違反は 400。
    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"buildId\":\"01900000-0001-7000-8000-000000000001\"}",
                "{\"id\":\"01900000-0001-7000-8000-000000000001\"}",
                "{\"id\":\"abc\",\"buildId\":\"01900000-0001-7000-8000-000000000001\"}",
                "{\"id\":\"01900000-0001-7000-8000-000000000001\",\"buildId\":\"abc\"}"
            })
    void createWithMalformedRequestIsBadRequest(String body) throws Exception {
        assertThat(call("POST", SHARES, alice, body).status()).isEqualTo(400);
        assertThat(shareRows()).isZero();
    }

    // AC-12: 一覧は自分の有効な共有を ID の降順で返す。取り消し済み・他のユーザーを含まず、元の構成を削除した共有を含む。
    @Test
    void listIsOwnActiveDescending() throws Exception {
        for (int n = 1; n <= 4; n++) {
            createBuild(alice, id(n), NAME + n);
        }
        createBuild(bob, id(5), NAME);
        share(alice, id(11), id(1));
        share(alice, id(13), id(2));
        share(alice, id(12), id(3));
        share(alice, id(14), id(4));
        share(bob, id(15), id(5));
        call("DELETE", SHARES + "/" + id(14), alice, null);
        call("DELETE", BUILDS + "/" + id(1), alice, null);

        JsonNode listed = json(call("GET", SHARES, alice, null));

        List<String> ids = listed.valueStream().map(n -> n.get("id").asString()).toList();
        assertThat(ids).containsExactly(id(13).toString(), id(12).toString(), id(11).toString());
    }

    // AC-9, AC-14: 取り消しは論理削除で冪等。取り消した後は同じ構成で別の短縮 ID の共有を作れる。
    @Test
    void revokeIsIdempotentAndAllowsNewShare() throws Exception {
        createBuild(alice, id(1), NAME);
        String oldShort = json(share(alice, id(10), id(1))).get("shortId").asString();

        assertThat(call("DELETE", SHARES + "/" + id(10), alice, null).status()).isEqualTo(204);
        assertThat(revoked(id(10))).isTrue();
        assertThat(call("DELETE", SHARES + "/" + id(10), alice, null).status()).isEqualTo(204);
        Res again = share(alice, id(11), id(1));

        assertThat(again.status()).isEqualTo(201);
        assertThat(json(again).get("shortId").asString()).isNotEqualTo(oldShort);
        assertThat(shareRows()).isEqualTo(2);
    }

    // AC-9: 存在しない ID・UUID でない ID も 204。
    @ParameterizedTest
    @ValueSource(strings = {"01900000-0001-7000-8000-0000000000ff", "not-a-uuid"})
    void revokeUnknownIdIs204(String id) throws Exception {
        assertThat(call("DELETE", SHARES + "/" + id, alice, null).status()).isEqualTo(204);
    }

    // AC-9, AC-12: 他のユーザーの共有は一覧に出ず、取り消しは 204 で行を変えない。
    @Test
    void otherUsersShareIsIsolated() throws Exception {
        createBuild(bob, id(1), NAME);
        share(bob, id(10), id(1));

        assertThat(json(call("GET", SHARES, alice, null)).size()).isZero();
        assertThat(call("DELETE", SHARES + "/" + id(10), alice, null).status()).isEqualTo(204);
        assertThat(revoked(id(10))).isFalse();
    }

    // AC-12: 未ログインは 401。
    @Test
    void unauthenticatedIs401() throws Exception {
        assertThat(call("GET", SHARES, null, null).status()).isEqualTo(401);
        assertThat(http.sendJson("POST", SHARES, "XSRF-TOKEN=" + XSRF, XSRF, "{}")
                        .status())
                .isEqualTo(401);
        assertThat(http.sendJson("DELETE", SHARES + "/" + id(1), "XSRF-TOKEN=" + XSRF, XSRF, null)
                        .status())
                .isEqualTo(401);
    }

    // AC-12: CSRF トークンの無い状態変更は 403 で、行を変えない。
    @Test
    void missingCsrfTokenIsRejected() throws Exception {
        createBuild(alice, id(1), NAME);
        String session = alice.substring(0, alice.indexOf(';'));
        String createBody = "{\"id\":\"" + id(10) + "\",\"buildId\":\"" + id(1) + "\"}";

        assertThat(http.sendJson("POST", SHARES, session, null, createBody).status())
                .isEqualTo(403);
        assertThat(shareRows()).isZero();

        share(alice, id(10), id(1));
        assertThat(http.sendJson("DELETE", SHARES + "/" + id(10), session, null, null)
                        .status())
                .isEqualTo(403);
        assertThat(revoked(id(10))).isFalse();
    }
}

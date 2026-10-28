package io.github.motokitabata.skillweave.controller;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.DiscordHttp.Res;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
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
 * 護石の API（010 charm-save。受入基準 AC-2, 5, 6, 7, 8, 9, 10, 13, 14）。
 * 実際の HTTP（組み込み Tomcat）で、ログインの Cookie と CSRF トークンを付けて呼ぶ。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class CharmControllerTest {

    private static final String CHARMS = "/api/charms";
    private static final String XSRF = "x";
    private static final String VALID_PAYLOAD =
            "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:101\",\"level\":2}],\"slots\":[{\"target\":\"weapon\",\"level\":3}]}";
    private static final String OTHER_PAYLOAD = "{\"rarity\":5,\"skills\":[],\"slots\":[]}";
    private static final String SELECT_COUNT = "SELECT count(*) FROM charms WHERE id = ?";
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
        jdbc.update("DELETE FROM charms");
        alice = cookies(http.login("300000000000000001"));
        bob = cookies(http.login("300000000000000002"));
    }

    private static String cookies(String session) {
        return DiscordHttp.SESSION + "=" + session + "; XSRF-TOKEN=" + XSRF;
    }

    /** 連番から決定的な UUIDv7（版 7・variant RFC 4122）を作る。n が大きいほど ID は大きい。 */
    private static UUID id(long n) {
        long msb = ((BASE_MILLIS + n) << 16) | 0x7000L;
        long lsb = 0x8000_0000_0000_0000L | n;
        return new UUID(msb, lsb);
    }

    private static String createBody(Object id, String payload) {
        return "{\"id\":\"" + id + "\",\"payload\":" + payload + ",\"schemaVersion\":1}";
    }

    private static String updateBody(String payload, int version) {
        return "{\"payload\":" + payload + ",\"schemaVersion\":1,\"version\":" + version + "}";
    }

    private Res call(String method, String path, String cookies, String body) throws Exception {
        return http.sendJson(method, path, cookies, cookies == null ? null : XSRF, body);
    }

    private Res create(String cookies, UUID id, String payload) throws Exception {
        return call("POST", CHARMS, cookies, createBody(id, payload));
    }

    private JsonNode json(Res res) {
        return mapper.readTree(res.body());
    }

    private int rows(UUID id) {
        Integer n = jdbc.queryForObject(SELECT_COUNT, Integer.class, id);
        return n == null ? 0 : n;
    }

    private int rowVersion(UUID id) {
        Integer v = jdbc.queryForObject("SELECT version FROM charms WHERE id = ?", Integer.class, id);
        return v == null ? -1 : v;
    }

    private String rowPayload(UUID id) {
        return jdbc.queryForObject("SELECT payload::text FROM charms WHERE id = ?", String.class, id);
    }

    private boolean isDeleted(UUID id) {
        Boolean b = jdbc.queryForObject("SELECT deleted_at IS NOT NULL FROM charms WHERE id = ?", Boolean.class, id);
        return Boolean.TRUE.equals(b);
    }

    private long totalRows() {
        Long n = jdbc.queryForObject("SELECT count(*) FROM charms", Long.class);
        return n == null ? 0 : n;
    }

    // AC-2, AC-5: 作成・一覧・更新・削除の往復。応答は 201 と保存後の護石（サーバー管理の項目付き）。
    @Test
    void createListUpdateDeleteRoundTrip() throws Exception {
        UUID id = id(1);

        Res created = create(alice, id, VALID_PAYLOAD);
        assertThat(created.status()).isEqualTo(201);
        assertThat(created.header("Content-Type")).startsWith("application/json");
        JsonNode c = json(created);
        assertThat(c.get("id").asString()).isEqualTo(id.toString());
        assertThat(c.get("schemaVersion").asInt()).isEqualTo(1);
        assertThat(c.get("version").asInt()).isZero();
        assertThat(c.get("payload").get("rarity").asInt()).isEqualTo(8);
        assertThat(c.get("createdAt").asString()).isNotEmpty();
        assertThat(c.get("updatedAt").asString()).isNotEmpty();

        JsonNode listed = json(call("GET", CHARMS, alice, null));
        assertThat(listed.size()).isEqualTo(1);
        assertThat(listed.get(0).get("id").asString()).isEqualTo(id.toString());

        Res updated = call("PUT", CHARMS + "/" + id, alice, updateBody(OTHER_PAYLOAD, 0));
        assertThat(updated.status()).isEqualTo(200);
        JsonNode u = json(updated);
        assertThat(u.get("version").asInt()).isEqualTo(1);
        assertThat(u.get("payload").get("rarity").asInt()).isEqualTo(5);
        assertThat(u.get("createdAt").asString()).isEqualTo(c.get("createdAt").asString());
        assertThat(u.get("updatedAt").asString())
                .isNotEqualTo(c.get("updatedAt").asString());
        assertThat(rowVersion(id)).isEqualTo(1);

        assertThat(call("DELETE", CHARMS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(json(call("GET", CHARMS, alice, null)).size()).isZero();
    }

    // AC-5: 一覧は自分の削除していない行だけを ID の降順で返す。作成日時・版は要求の値を使わない。
    @Test
    void listIsOwnUndeletedDescendingAndIgnoresClientManagedFields() throws Exception {
        create(alice, id(1), VALID_PAYLOAD);
        create(alice, id(3), VALID_PAYLOAD);
        create(alice, id(2), VALID_PAYLOAD);
        create(alice, id(4), VALID_PAYLOAD);
        create(bob, id(5), VALID_PAYLOAD);
        call("DELETE", CHARMS + "/" + id(4), alice, null);
        String withManaged = "{\"id\":\"" + id(6) + "\",\"payload\":" + VALID_PAYLOAD
                + ",\"schemaVersion\":1,\"version\":9,\"createdAt\":\"2000-01-01T00:00:00Z\"}";
        Res managed = call("POST", CHARMS, alice, withManaged);
        assertThat(managed.status()).isEqualTo(201);
        assertThat(json(managed).get("version").asInt()).isZero();
        assertThat(json(managed).get("createdAt").asString()).doesNotStartWith("2000");

        JsonNode listed = json(call("GET", CHARMS, alice, null));

        List<String> ids = listed.valueStream().map(n -> n.get("id").asString()).toList();
        assertThat(ids).containsExactly(id(6).toString(), id(3).toString(), id(2).toString(), id(1).toString());
    }

    // AC-5, AC-9: 他のユーザーの護石は、一覧に出ず、更新は 404、削除は 204 で、行は変わらない。
    @Test
    void otherUsersCharmIsIsolated() throws Exception {
        UUID id = id(1);
        create(bob, id, VALID_PAYLOAD);
        String before = rowPayload(id);

        assertThat(json(call("GET", CHARMS, alice, null)).size()).isZero();
        assertThat(call("PUT", CHARMS + "/" + id, alice, updateBody(OTHER_PAYLOAD, 0))
                        .status())
                .isEqualTo(404);
        assertThat(call("DELETE", CHARMS + "/" + id, alice, null).status()).isEqualTo(204);

        assertThat(rowPayload(id)).isEqualTo(before);
        assertThat(rowVersion(id)).isZero();
        assertThat(isDeleted(id)).isFalse();
    }

    // AC-7: ID が自分の行・他のユーザーの行・削除済みの行と衝突したら 409 で、既存の行を変えない。
    @Test
    void createWithCollidingIdIsConflict() throws Exception {
        UUID mine = id(1);
        UUID others = id(2);
        UUID deleted = id(3);
        create(alice, mine, VALID_PAYLOAD);
        create(bob, others, VALID_PAYLOAD);
        create(alice, deleted, VALID_PAYLOAD);
        call("DELETE", CHARMS + "/" + deleted, alice, null);

        for (UUID id : List.of(mine, others, deleted)) {
            Res res = create(alice, id, OTHER_PAYLOAD);
            assertThat(res.status()).as("id=%s", id).isEqualTo(409);
            assertThat(res.header("Content-Type")).startsWith("application/problem+json");
            assertThat(rowPayload(id)).contains("\"rarity\": 8");
        }
        assertThat(isDeleted(deleted)).isTrue();
    }

    // AC-8: 行バージョンの不一致は 409 で上書きしない。
    @Test
    void updateWithStaleVersionIsConflict() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);
        call("PUT", CHARMS + "/" + id, alice, updateBody(OTHER_PAYLOAD, 0));

        Res res = call("PUT", CHARMS + "/" + id, alice, updateBody(VALID_PAYLOAD, 0));

        assertThat(res.status()).isEqualTo(409);
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(rowPayload(id)).contains("\"rarity\": 5");
        assertThat(rowVersion(id)).isEqualTo(1);
    }

    // AC-8: 自分の削除していない行が無い（存在しない・削除済み・UUID でない ID）更新は 404。
    @Test
    void updateOfMissingDeletedOrMalformedIdIsNotFound() throws Exception {
        UUID deleted = id(1);
        create(alice, deleted, VALID_PAYLOAD);
        call("DELETE", CHARMS + "/" + deleted, alice, null);

        for (String target : List.of(id(2).toString(), deleted.toString(), "not-a-uuid")) {
            Res res = call("PUT", CHARMS + "/" + target, alice, updateBody(OTHER_PAYLOAD, 0));
            assertThat(res.status()).as("id=%s", target).isEqualTo(404);
            assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        }
    }

    // AC-9: 論理削除（deleted_at）で、行バージョンを照合せず、何度でも・存在しない ID でも 204。
    @Test
    void deleteIsLogicalAndIdempotent() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);

        assertThat(call("DELETE", CHARMS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", CHARMS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", CHARMS + "/" + id(2), alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", CHARMS + "/not-a-uuid", alice, null).status()).isEqualTo(204);

        assertThat(rows(id)).isEqualTo(1);
        assertThat(isDeleted(id)).isTrue();
    }

    // AC-9: 削除の途中で別の要求が同じ行の行バージョンを進めても、500 にならず 204 で削除済みになる。
    @Test
    void deleteIsNotAffectedByConcurrentVersionBump() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);
        int before = rowVersion(id);
        jdbc.update("UPDATE charms SET version = version + 1 WHERE id = ?", id);

        assertThat(call("DELETE", CHARMS + "/" + id, alice, null).status()).isEqualTo(204);

        assertThat(isDeleted(id)).isTrue();
        assertThat(rowVersion(id)).isEqualTo(before + 2);
    }

    // AC-9: 削除は行バージョンを 1 進め、その後の更新（古い版）でも削除済みのまま生き返らない。
    // 読んだ後に削除が割り込む競合そのものは HTTP では決定的に再現できないので、version の加算で固定する。
    @Test
    void deleteBumpsVersionAndStaleUpdateDoesNotRevive() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);
        int before = rowVersion(id);
        call("DELETE", CHARMS + "/" + id, alice, null);

        assertThat(rowVersion(id)).isEqualTo(before + 1);
        Res res = call("PUT", CHARMS + "/" + id, alice, updateBody(OTHER_PAYLOAD, before));

        assertThat(res.status()).isEqualTo(404);
        assertThat(isDeleted(id)).isTrue();
    }

    // AC-10: 構造の制約の境界の内側は保存できる。
    @ParameterizedTest
    @MethodSource("validPayloads")
    void boundaryValidPayloadsAreAccepted(String payload) throws Exception {
        UUID id = id(1);

        assertThat(create(alice, id, payload).status()).isEqualTo(201);
        assertThat(rows(id)).isEqualTo(1);
    }

    static Stream<String> validPayloads() {
        String three =
                "{\"skillId\":\"sk:1\",\"level\":1},{\"skillId\":\"sk:2\",\"level\":5},{\"skillId\":\"sk:3\",\"level\":1}";
        String slots =
                "{\"target\":\"weapon\",\"level\":1},{\"target\":\"armor\",\"level\":3},{\"target\":\"armor\",\"level\":2}";
        return Stream.of(
                "{\"rarity\":5,\"skills\":[],\"slots\":[]}",
                // 011 D5: gameId が負のスキル ID（弱点特効など）も受け付ける。
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:-397570464\",\"level\":1}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[" + three + "],\"slots\":[" + slots + "]}");
    }

    // 011 D5: 負の ID のスキルを持つ護石を更新で受け付ける。
    @Test
    void updateAcceptsNegativeSkillId() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);
        String negative = "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:-397570464\",\"level\":1}],\"slots\":[]}";

        Res res = call("PUT", CHARMS + "/" + id, alice, updateBody(negative, 0));

        assertThat(res.status()).isEqualTo(200);
        assertThat(rowPayload(id)).contains("sk:-397570464");
    }

    // AC-10: 構造の制約に反する内容は 400 で、保存しない（作成・更新の両方）。
    @ParameterizedTest
    @MethodSource("invalidPayloads")
    void invalidPayloadIsRejectedWithBadRequest(String payload) throws Exception {
        UUID id = id(1);
        Res created = create(alice, id, payload);
        assertThat(created.status()).as(payload).isEqualTo(400);
        assertThat(created.header("Content-Type")).startsWith("application/problem+json");
        assertThat(rows(id)).isZero();

        create(alice, id, VALID_PAYLOAD);
        Res updated = call("PUT", CHARMS + "/" + id, alice, updateBody(payload, 0));
        assertThat(updated.status()).as(payload).isEqualTo(400);
        assertThat(rowVersion(id)).isZero();
        assertThat(rowPayload(id)).contains("\"rarity\": 8");
    }

    static Stream<String> invalidPayloads() {
        String skill = "{\"skillId\":\"sk:1\",\"level\":1}";
        return Stream.of(
                "null",
                "[]",
                "{\"skills\":[],\"slots\":[]}",
                "{\"rarity\":4,\"skills\":[],\"slots\":[]}",
                "{\"rarity\":9,\"skills\":[],\"slots\":[]}",
                "{\"rarity\":null,\"skills\":[],\"slots\":[]}",
                "{\"rarity\":\"abc\",\"skills\":[],\"slots\":[]}",
                "{\"rarity\":\"8\",\"skills\":[],\"slots\":[]}",
                "{\"rarity\":8.5,\"skills\":[],\"slots\":[]}",
                "{\"rarity\":8,\"slots\":[]}",
                "{\"rarity\":8,\"skills\":null,\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[]}",
                "{\"rarity\":8,\"skills\":[" + skill + "," + skill.replace("sk:1", "sk:2") + ","
                        + skill.replace("sk:1", "sk:3") + "," + skill.replace("sk:1", "sk:4") + "],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[" + skill + "," + skill + "],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[null],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"x:1\",\"level\":1}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:\",\"level\":1}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:1a\",\"level\":1}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:-\",\"level\":1}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:--1\",\"level\":1}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"level\":1}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:1\",\"level\":0}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:1\"}],\"slots\":[]}",
                "{\"rarity\":8,\"skills\":[],\"slots\":[{\"target\":\"weapon\",\"level\":1},{\"target\":\"weapon\",\"level\":1},"
                        + "{\"target\":\"armor\",\"level\":1},{\"target\":\"armor\",\"level\":1}]}",
                "{\"rarity\":8,\"skills\":[],\"slots\":[{\"target\":\"head\",\"level\":1}]}",
                "{\"rarity\":8,\"skills\":[],\"slots\":[{\"level\":1}]}",
                "{\"rarity\":8,\"skills\":[],\"slots\":[{\"target\":\"weapon\",\"level\":0}]}",
                "{\"rarity\":8,\"skills\":[],\"slots\":[{\"target\":\"weapon\",\"level\":4}]}",
                "{\"rarity\":8,\"skills\":[],\"slots\":[{\"target\":\"weapon\"}]}");
    }

    // AC-10: ID・スキーマ版・行バージョンと、JSON として読めない本文は 400 で、保存しない。
    @ParameterizedTest
    @MethodSource("invalidEnvelopes")
    void invalidCreateEnvelopeIsRejected(String body) throws Exception {
        Res res = call("POST", CHARMS, alice, body);

        assertThat(res.status()).as(body).isEqualTo(400);
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(totalRows()).isZero();
    }

    static Stream<String> invalidEnvelopes() {
        String ok = "\"payload\":" + VALID_PAYLOAD + ",\"schemaVersion\":1";
        UUID v7 = id(1);
        UUID v4 = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
        UUID v7BadVariant = new UUID(v7.getMostSignificantBits(), 0x4000_0000_0000_0001L);
        return Stream.of(
                "{\"id\":\"" + v4 + "\"," + ok + "}",
                "{\"id\":\"" + v7BadVariant + "\"," + ok + "}",
                "{\"id\":\"not-a-uuid\"," + ok + "}",
                "{\"id\":null," + ok + "}",
                "{" + ok + "}",
                "{\"id\":\"" + v7 + "\",\"payload\":" + VALID_PAYLOAD + ",\"schemaVersion\":2}",
                "{\"id\":\"" + v7 + "\",\"payload\":" + VALID_PAYLOAD + ",\"schemaVersion\":0}",
                "{\"id\":\"" + v7 + "\",\"payload\":" + VALID_PAYLOAD + "}",
                "{\"id\":\"" + v7 + "\",\"schemaVersion\":1}",
                "{\"id\":\"" + v7 + "\"," + ok.replace("\"payload\":" + VALID_PAYLOAD, "\"payload\":null") + "}",
                "{\"id\":\"" + v7 + "\"," + ok,
                "");
    }

    // AC-10: 更新の行バージョン・スキーマ版の不備は 400。
    @ParameterizedTest
    @MethodSource("invalidUpdateEnvelopes")
    void invalidUpdateEnvelopeIsRejected(String body) throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);

        Res res = call("PUT", CHARMS + "/" + id, alice, body);

        assertThat(res.status()).as(body).isEqualTo(400);
        assertThat(rowVersion(id)).isZero();
    }

    static Stream<String> invalidUpdateEnvelopes() {
        return Stream.of(
                "{\"payload\":" + OTHER_PAYLOAD + ",\"schemaVersion\":1}",
                "{\"payload\":" + OTHER_PAYLOAD + ",\"schemaVersion\":1,\"version\":-1}",
                "{\"payload\":" + OTHER_PAYLOAD + ",\"schemaVersion\":1,\"version\":null}",
                "{\"payload\":" + OTHER_PAYLOAD + ",\"schemaVersion\":2,\"version\":0}",
                "{\"payload\":" + OTHER_PAYLOAD + ",\"version\":0}",
                "{\"schemaVersion\":1,\"version\":0}");
    }

    // AC-6: 未ログインは 4 つとも 401（problem+json・リダイレクトなし）で、護石を変えない。
    @ParameterizedTest
    @MethodSource("unauthenticatedCalls")
    void unauthenticatedCallsReturn401(String method, String path, String body) throws Exception {
        Res res = http.sendJson(method, path, "XSRF-TOKEN=" + XSRF, XSRF, body);

        assertThat(res.status()).isEqualTo(401);
        assertThat(res.header("Location")).isNull();
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(totalRows()).isZero();
    }

    static Stream<Arguments> unauthenticatedCalls() {
        return Stream.of(
                Arguments.of("GET", CHARMS, null),
                Arguments.of("POST", CHARMS, createBody(id(1), VALID_PAYLOAD)),
                Arguments.of("PUT", CHARMS + "/" + id(1), updateBody(VALID_PAYLOAD, 0)),
                Arguments.of("DELETE", CHARMS + "/" + id(1), null));
    }

    // AC-6: CSRF トークンの無い POST・PUT・DELETE は 403 で拒否し、護石を変えない。
    @Test
    void mutationsWithoutCsrfTokenAreForbidden() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);
        String sessionOnly = alice.substring(0, alice.indexOf(';'));
        String before = rowPayload(id);

        Res post = http.sendJson("POST", CHARMS, sessionOnly, null, createBody(id(2), VALID_PAYLOAD));
        Res put = http.sendJson("PUT", CHARMS + "/" + id, sessionOnly, null, updateBody(OTHER_PAYLOAD, 0));
        Res delete = http.sendJson("DELETE", CHARMS + "/" + id, sessionOnly, null, null);

        assertThat(List.of(post.status(), put.status(), delete.status())).containsOnly(403);
        assertThat(rows(id(2))).isZero();
        assertThat(rowPayload(id)).isEqualTo(before);
        assertThat(rowVersion(id)).isZero();
        assertThat(isDeleted(id)).isFalse();
    }

    // AC-13: payload の jsonb に書かれるキーは Web の形と一致する。
    @Test
    void payloadIsStoredWithTheWebKeys() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);

        Set<String> top = Set.copyOf(
                jdbc.queryForList("SELECT jsonb_object_keys(payload) FROM charms WHERE id = ?", String.class, id));
        Set<String> skill = Set.copyOf(jdbc.queryForList(
                "SELECT jsonb_object_keys(payload->'skills'->0) FROM charms WHERE id = ?", String.class, id));
        Set<String> slot = Set.copyOf(jdbc.queryForList(
                "SELECT jsonb_object_keys(payload->'slots'->0) FROM charms WHERE id = ?", String.class, id));

        assertThat(top).containsExactlyInAnyOrder("rarity", "skills", "slots");
        assertThat(skill).containsExactlyInAnyOrder("skillId", "level");
        assertThat(slot).containsExactlyInAnyOrder("target", "level");
        assertThat(jdbc.queryForObject("SELECT schema_version FROM charms WHERE id = ?", Integer.class, id))
                .isEqualTo(1);
    }
}

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
 * 個体差のある武器の API（013 user-weapon-save。受入基準 AC-6, 7, 8, 9, 10, 11, 13, 14）。
 * 実際の HTTP（組み込み Tomcat）で、ログインの Cookie と CSRF トークンを付けて呼ぶ。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class WeaponControllerTest {

    private static final String WEAPONS = "/api/weapons";
    private static final String XSRF = "x";
    private static final String SELECT_ONE = "SELECT %s FROM weapons WHERE id = ?";
    private static final long BASE_MILLIS = 0x0190_0000_0000L;
    private static final String NAME_KEY = "name";
    private static final String ELEMENT_KEY = "element";

    private static final String VALID_PAYLOAD = payload(null, null);
    private static final String OTHER_PAYLOAD = payload(NAME_KEY, "\"別\"");

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
        jdbc.update("DELETE FROM weapons");
        alice = cookies(http.login("400000000000000001"));
        bob = cookies(http.login("400000000000000002"));
    }

    private static String cookies(String session) {
        return DiscordHttp.SESSION + "=" + session + "; XSRF-TOKEN=" + XSRF;
    }

    /** 連番から決定的な UUIDv7 を作る。n が大きいほど ID は大きい。 */
    private static UUID id(long n) {
        long msb = ((BASE_MILLIS + n) << 16) | 0x7000L;
        long lsb = 0x8000_0000_0000_0000L | n;
        return new UUID(msb, lsb);
    }

    /** key を value に差し替えた payload。value が null ならそのキーを省く。 */
    private static String payload(String key, String value) {
        String[][] defaults = {
            {"baseWeaponId", "\"wp:bow:1\""},
            {NAME_KEY, "\"自作\""},
            {"attack", "200"},
            {"affinity", "-10"},
            {ELEMENT_KEY, "{\"type\":\"fire\",\"value\":30}"},
            {"slots", "[{\"target\":\"weapon\",\"level\":3}]"},
            {"seriesBonusId", "\"sb:-1305836672\""},
            {"groupBonusId", "null"}
        };
        StringBuilder sb = new StringBuilder("{");
        for (String[] d : defaults) {
            String v = d[0].equals(key) ? value : d[1];
            if (v != null) {
                sb.append(sb.length() > 1 ? "," : "")
                        .append('"')
                        .append(d[0])
                        .append("\":")
                        .append(v);
            }
        }
        return sb.append('}').toString();
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
        return call("POST", WEAPONS, cookies, createBody(id, payload));
    }

    private JsonNode json(Res res) {
        return mapper.readTree(res.body());
    }

    private int rows(UUID id) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM weapons WHERE id = ?", Integer.class, id);
        return n == null ? 0 : n;
    }

    private long totalRows() {
        Long n = jdbc.queryForObject("SELECT count(*) FROM weapons", Long.class);
        return n == null ? 0 : n;
    }

    private int rowVersion(UUID id) {
        Integer v = jdbc.queryForObject(SELECT_ONE.formatted("version"), Integer.class, id);
        return v == null ? -1 : v;
    }

    private String rowPayload(UUID id) {
        return jdbc.queryForObject(SELECT_ONE.formatted("payload::text"), String.class, id);
    }

    private boolean isDeleted(UUID id) {
        Boolean b = jdbc.queryForObject(SELECT_ONE.formatted("deleted_at IS NOT NULL"), Boolean.class, id);
        return Boolean.TRUE.equals(b);
    }

    // AC-6, AC-14: 作成・一覧・更新・削除の往復。サーバー管理の項目が付く。
    @Test
    void createListUpdateDeleteRoundTrip() throws Exception {
        UUID id = id(1);

        Res created = create(alice, id, VALID_PAYLOAD);
        assertThat(created.status()).isEqualTo(201);
        JsonNode c = json(created);
        assertThat(c.get("id").asString()).isEqualTo(id.toString());
        assertThat(c.get("schemaVersion").asInt()).isEqualTo(1);
        assertThat(c.get("version").asInt()).isZero();
        assertThat(c.get("payload").get(NAME_KEY).asString()).isEqualTo("自作");
        assertThat(c.get("createdAt").asString()).isNotEmpty();

        JsonNode listed = json(call("GET", WEAPONS, alice, null));
        assertThat(listed.size()).isEqualTo(1);

        Res updated = call("PUT", WEAPONS + "/" + id, alice, updateBody(OTHER_PAYLOAD, 0));
        assertThat(updated.status()).isEqualTo(200);
        JsonNode u = json(updated);
        assertThat(u.get("version").asInt()).isEqualTo(1);
        assertThat(u.get("payload").get(NAME_KEY).asString()).isEqualTo("別");
        assertThat(u.get("createdAt").asString()).isEqualTo(c.get("createdAt").asString());
        assertThat(u.get("updatedAt").asString())
                .isNotEqualTo(c.get("updatedAt").asString());

        assertThat(call("DELETE", WEAPONS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(json(call("GET", WEAPONS, alice, null)).size()).isZero();
    }

    // AC-6: 一覧は自分の削除していない行だけを ID の降順で返す。版・作成日時は要求の値を使わない。
    @Test
    void listIsOwnUndeletedDescendingAndIgnoresClientManagedFields() throws Exception {
        create(alice, id(1), VALID_PAYLOAD);
        create(alice, id(3), VALID_PAYLOAD);
        create(alice, id(2), VALID_PAYLOAD);
        create(alice, id(4), VALID_PAYLOAD);
        create(bob, id(5), VALID_PAYLOAD);
        call("DELETE", WEAPONS + "/" + id(4), alice, null);
        String withManaged = "{\"id\":\"" + id(6) + "\",\"payload\":" + VALID_PAYLOAD
                + ",\"schemaVersion\":1,\"version\":9,\"createdAt\":\"2000-01-01T00:00:00Z\"}";
        Res managed = call("POST", WEAPONS, alice, withManaged);
        assertThat(managed.status()).isEqualTo(201);
        assertThat(json(managed).get("version").asInt()).isZero();
        assertThat(json(managed).get("createdAt").asString()).doesNotStartWith("2000");

        List<String> ids = json(call("GET", WEAPONS, alice, null))
                .valueStream()
                .map(n -> n.get("id").asString())
                .toList();

        assertThat(ids).containsExactly(id(6).toString(), id(3).toString(), id(2).toString(), id(1).toString());
    }

    // AC-6, AC-9: 他のユーザーの武器は、一覧に出ず、更新は 404、削除は 204 で、行は変わらない。
    @Test
    void otherUsersWeaponIsIsolated() throws Exception {
        UUID id = id(1);
        create(bob, id, VALID_PAYLOAD);
        String before = rowPayload(id);

        assertThat(json(call("GET", WEAPONS, alice, null)).size()).isZero();
        Res put = call("PUT", WEAPONS + "/" + id, alice, updateBody(OTHER_PAYLOAD, 0));
        assertThat(put.status()).isEqualTo(404);
        assertThat(json(put).get("detail").asString()).isEqualTo("Weapon not found");
        assertThat(call("DELETE", WEAPONS + "/" + id, alice, null).status()).isEqualTo(204);

        assertThat(rowPayload(id)).isEqualTo(before);
        assertThat(rowVersion(id)).isZero();
        assertThat(isDeleted(id)).isFalse();
    }

    // AC-8: ID が自分の行・他のユーザーの行・削除済みの行と衝突したら 409 で、既存の行を変えない。
    @Test
    void createWithCollidingIdIsConflict() throws Exception {
        UUID mine = id(1);
        UUID others = id(2);
        UUID deleted = id(3);
        create(alice, mine, VALID_PAYLOAD);
        create(bob, others, VALID_PAYLOAD);
        create(alice, deleted, VALID_PAYLOAD);
        call("DELETE", WEAPONS + "/" + deleted, alice, null);

        for (UUID id : List.of(mine, others, deleted)) {
            Res res = create(alice, id, OTHER_PAYLOAD);
            assertThat(res.status()).as("id=%s", id).isEqualTo(409);
            assertThat(res.header("Content-Type")).startsWith("application/problem+json");
            assertThat(json(res).get("detail").asString()).isEqualTo("Weapon id already exists");
            assertThat(rowPayload(id)).contains("自作");
        }
        assertThat(isDeleted(deleted)).isTrue();
    }

    // AC-8: 行バージョンの不一致は 409 で上書きしない。
    @Test
    void updateWithStaleVersionIsConflict() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);
        call("PUT", WEAPONS + "/" + id, alice, updateBody(OTHER_PAYLOAD, 0));

        Res res = call("PUT", WEAPONS + "/" + id, alice, updateBody(VALID_PAYLOAD, 0));

        assertThat(res.status()).isEqualTo(409);
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(json(res).get("detail").asString()).isEqualTo("Weapon was changed by another request");
        assertThat(rowPayload(id)).contains("別");
        assertThat(rowVersion(id)).isEqualTo(1);
    }

    // AC-8: 自分の削除していない行が無い（存在しない・削除済み・UUID でない ID）更新は 404。
    @Test
    void updateOfMissingDeletedOrMalformedIdIsNotFound() throws Exception {
        UUID deleted = id(1);
        create(alice, deleted, VALID_PAYLOAD);
        call("DELETE", WEAPONS + "/" + deleted, alice, null);

        for (String target : List.of(id(2).toString(), deleted.toString(), "not-a-uuid")) {
            Res res = call("PUT", WEAPONS + "/" + target, alice, updateBody(OTHER_PAYLOAD, 0));
            assertThat(res.status()).as("id=%s", target).isEqualTo(404);
            assertThat(res.header("Content-Type")).startsWith("application/problem+json");
            assertThat(json(res).get("detail").asString()).isEqualTo("Weapon not found");
        }
    }

    // AC-9: 論理削除で、何度でも・存在しない ID でも 204。
    @Test
    void deleteIsLogicalAndIdempotent() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);

        assertThat(call("DELETE", WEAPONS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", WEAPONS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", WEAPONS + "/" + id(2), alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", WEAPONS + "/not-a-uuid", alice, null).status())
                .isEqualTo(204);

        assertThat(rows(id)).isEqualTo(1);
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
        String slot = "{\"target\":\"weapon\",\"level\":1}";
        return Stream.of(
                payload(NAME_KEY, "\"\""),
                payload(NAME_KEY, "\"" + "あ".repeat(30) + "\""),
                payload(NAME_KEY, "\"" + "😀".repeat(30) + "\""),
                payload("attack", "1"),
                payload("attack", "999"),
                payload("affinity", "-100"),
                payload("affinity", "100"),
                payload(ELEMENT_KEY, null),
                payload(ELEMENT_KEY, "{\"type\":\"blastblight\",\"value\":1}"),
                payload(ELEMENT_KEY, "{\"type\":\"fire\",\"value\":99}"),
                payload("slots", "[]"),
                payload("slots", "[" + slot + "," + slot + "," + slot + "]"),
                payload("seriesBonusId", "null"));
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
        Res updated = call("PUT", WEAPONS + "/" + id, alice, updateBody(payload, 0));
        assertThat(updated.status()).as(payload).isEqualTo(400);
        assertThat(rowVersion(id)).isZero();
        assertThat(rowPayload(id)).contains("自作");
    }

    static Stream<String> invalidPayloads() {
        String slot = "{\"target\":\"weapon\",\"level\":1}";
        return Stream.of(
                "null",
                "[]",
                payload(NAME_KEY, "\"" + "あ".repeat(31) + "\""),
                payload(NAME_KEY, "\"" + "😀".repeat(31) + "\""),
                payload(NAME_KEY, null),
                payload("attack", "0"),
                payload("attack", "1000"),
                payload("attack", "null"),
                payload("attack", "\"200\""),
                payload("attack", "200.5"),
                payload("affinity", "-101"),
                payload("affinity", "101"),
                payload(ELEMENT_KEY, "{\"type\":\"fire\",\"value\":0}"),
                payload(ELEMENT_KEY, "{\"type\":\"fire\",\"value\":100}"),
                payload(ELEMENT_KEY, "{\"type\":\"wind\",\"value\":10}"),
                payload(ELEMENT_KEY, "{\"value\":10}"),
                payload(ELEMENT_KEY, "{\"type\":\"fire\"}"),
                payload("slots", "[" + slot + "," + slot + "," + slot + "," + slot + "]"),
                payload("slots", "[{\"target\":\"weapon\",\"level\":0}]"),
                payload("slots", "[{\"target\":\"weapon\",\"level\":4}]"),
                payload("slots", "[{\"target\":\"armor\",\"level\":1}]"),
                payload("slots", null),
                payload("baseWeaponId", "\"bow:1\""),
                payload("baseWeaponId", "null"),
                payload("seriesBonusId", "\"sb:x\""),
                payload("seriesBonusId", null),
                payload("groupBonusId", "\"gb:1\""),
                payload("groupBonusId", null));
    }

    // AC-10: ID・スキーマ版・行バージョンの不備と、JSON として読めない本文は 400 で、保存しない。
    @ParameterizedTest
    @MethodSource("invalidEnvelopes")
    void invalidCreateEnvelopeIsRejected(String body) throws Exception {
        Res res = call("POST", WEAPONS, alice, body);

        assertThat(res.status()).as(body).isEqualTo(400);
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(totalRows()).isZero();
    }

    static Stream<String> invalidEnvelopes() {
        String ok = "\"payload\":" + VALID_PAYLOAD + ",\"schemaVersion\":1";
        UUID v7 = id(1);
        UUID v4 = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
        return Stream.of(
                "{\"id\":\"" + v4 + "\"," + ok + "}",
                "{\"id\":\"not-a-uuid\"," + ok + "}",
                "{\"id\":null," + ok + "}",
                "{" + ok + "}",
                "{\"id\":\"" + v7 + "\",\"payload\":" + VALID_PAYLOAD + ",\"schemaVersion\":2}",
                "{\"id\":\"" + v7 + "\",\"payload\":" + VALID_PAYLOAD + "}",
                "{\"id\":\"" + v7 + "\",\"schemaVersion\":1}",
                "{\"id\":\"" + v7 + "\"," + ok,
                "");
    }

    @ParameterizedTest
    @MethodSource("invalidUpdateEnvelopes")
    void invalidUpdateEnvelopeIsRejected(String body) throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);

        Res res = call("PUT", WEAPONS + "/" + id, alice, body);

        assertThat(res.status()).as(body).isEqualTo(400);
        assertThat(rowVersion(id)).isZero();
    }

    static Stream<String> invalidUpdateEnvelopes() {
        return Stream.of(
                "{\"payload\":" + OTHER_PAYLOAD + ",\"schemaVersion\":1}",
                "{\"payload\":" + OTHER_PAYLOAD + ",\"schemaVersion\":1,\"version\":-1}",
                "{\"payload\":" + OTHER_PAYLOAD + ",\"schemaVersion\":2,\"version\":0}",
                "{\"schemaVersion\":1,\"version\":0}");
    }

    // AC-11: 文字列の項目に文字列以外・省略できる項目に明示の null・U+0000 を含む文字列は 400 で、保存しない。
    @ParameterizedTest
    @MethodSource("rejectedValues")
    void nonStringNullAndNulCharacterAreRejected(String key, String value) throws Exception {
        String bad = payload(key, value);
        UUID id = id(1);

        Res created = create(alice, id, bad);
        assertThat(created.status()).as(bad).isEqualTo(400);
        assertThat(rows(id)).isZero();

        create(alice, id, VALID_PAYLOAD);
        Res updated = call("PUT", WEAPONS + "/" + id, alice, updateBody(bad, 0));
        assertThat(updated.status()).as(bad).isEqualTo(400);
        assertThat(rowVersion(id)).isZero();
        assertThat(rowPayload(id)).contains("自作");
    }

    static Stream<Arguments> rejectedValues() {
        return Stream.of(
                Arguments.of(NAME_KEY, "5"),
                Arguments.of(NAME_KEY, "true"),
                Arguments.of(ELEMENT_KEY, "null"),
                Arguments.of(NAME_KEY, "\"a\\u0000b\""));
    }

    // AC-7: 未ログインは 4 つとも 401 で、武器を変えない。
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
                Arguments.of("GET", WEAPONS, null),
                Arguments.of("POST", WEAPONS, createBody(id(1), VALID_PAYLOAD)),
                Arguments.of("PUT", WEAPONS + "/" + id(1), updateBody(VALID_PAYLOAD, 0)),
                Arguments.of("DELETE", WEAPONS + "/" + id(1), null));
    }

    // AC-7: CSRF トークンの無い POST・PUT・DELETE は 403 で拒否し、武器を変えない。
    @Test
    void mutationsWithoutCsrfTokenAreForbidden() throws Exception {
        UUID id = id(1);
        create(alice, id, VALID_PAYLOAD);
        String sessionOnly = alice.substring(0, alice.indexOf(';'));
        String before = rowPayload(id);

        Res post = http.sendJson("POST", WEAPONS, sessionOnly, null, createBody(id(2), VALID_PAYLOAD));
        Res put = http.sendJson("PUT", WEAPONS + "/" + id, sessionOnly, null, updateBody(OTHER_PAYLOAD, 0));
        Res delete = http.sendJson("DELETE", WEAPONS + "/" + id, sessionOnly, null, null);

        assertThat(List.of(post.status(), put.status(), delete.status())).containsOnly(403);
        assertThat(rows(id(2))).isZero();
        assertThat(rowPayload(id)).isEqualTo(before);
        assertThat(rowVersion(id)).isZero();
        assertThat(isDeleted(id)).isFalse();
    }

    // AC-13: payload の jsonb に書かれるキーは Web の形と一致し、属性の無い武器では element のキーが無い。
    @Test
    void payloadIsStoredWithTheWebKeys() throws Exception {
        UUID id = id(1);
        UUID noElement = id(2);
        create(alice, id, VALID_PAYLOAD);
        create(alice, noElement, payload(ELEMENT_KEY, null));

        assertThat(keys(id, "payload"))
                .containsExactlyInAnyOrder(
                        "baseWeaponId",
                        NAME_KEY,
                        "attack",
                        "affinity",
                        ELEMENT_KEY,
                        "slots",
                        "seriesBonusId",
                        "groupBonusId");
        assertThat(keys(id, "payload->'element'")).containsExactlyInAnyOrder("type", "value");
        assertThat(keys(id, "payload->'slots'->0")).containsExactlyInAnyOrder("target", "level");
        assertThat(keys(noElement, "payload")).doesNotContain(ELEMENT_KEY);
        assertThat(jdbc.queryForObject(SELECT_ONE.formatted("schema_version"), Integer.class, id))
                .isEqualTo(1);
    }

    private Set<String> keys(UUID id, String expr) {
        return Set.copyOf(jdbc.queryForList(
                "SELECT jsonb_object_keys(" + expr + ") FROM weapons WHERE id = ?", String.class, id));
    }
}

package io.github.motokitabata.skillweave.controller;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.DiscordHttp.Res;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
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
 * 保存した構成の API（011 build-save。受入基準 AC-1, 7, 8, 9, 10, 11, 14）。
 * AC-13（builds テーブル）は、全テストが V4 のマイグレーションを適用した DB で動くことで暗黙に満たす。
 * 実際の HTTP（組み込み Tomcat）で、ログインの Cookie と CSRF トークンを付けて呼ぶ。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class BuildControllerTest {

    private static final String BUILDS = "/api/builds";
    private static final String XSRF = "x";
    private static final String NAME = "鉄刀【神楽】 構成3";
    private static final String MASTER_VERSION = "2026.10.4";
    private static final String CHARM_ID = "0190aaaa-0000-4000-8000-000000000001";
    private static final String SELECT_ONE = "SELECT %s FROM builds WHERE id = ?";
    private static final long BASE_MILLIS = 0x0190_0000_0000L;

    private static final String MASTER_WEAPON = "{\"kind\":\"master\",\"weaponId\":\"wp:charge-blade:22\"}";
    private static final String ARMOR =
            "{\"head\":\"ar:-2117203456:head\",\"chest\":null,\"arms\":\"ar:-1077030272:arms\",\"waist\":null,\"legs\":null}";
    private static final String CHARM_PAYLOAD =
            "{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:-397570464\",\"level\":2}],\"slots\":[{\"target\":\"weapon\",\"level\":3}]}";
    private static final String CHARM = "{\"id\":\"" + CHARM_ID + "\",\"payload\":" + CHARM_PAYLOAD + "}";
    private static final String DECORATION =
            "{\"slot\":{\"owner\":\"weapon\",\"index\":0},\"decorationId\":\"dc:-1003144960\"}";
    private static final String SKILL = "{\"skillId\":\"sk:-397570464\",\"level\":3,\"rawLevel\":4}";
    private static final String SLOT_REF = "{\"owner\":\"charm\",\"index\":2}";

    private static final Map<String, String> PAYLOAD_DEFAULTS = map(
            "weapon",
            MASTER_WEAPON,
            "armor",
            ARMOR,
            "charm",
            CHARM,
            "decorations",
            "[" + DECORATION + "]",
            "skills",
            "[" + SKILL + ",{\"skillId\":\"sk:850626240\",\"level\":1,\"rawLevel\":1}]",
            "freeSlots",
            "[" + SLOT_REF + "]",
            "activeConditionIds",
            "[\"cd:weak_point\",\"cd:xu_wus_vigor\"]");

    private static final Map<String, String> CUSTOM_DEFAULTS = map(
            "baseWeaponId", "\"wp:bow:1\"",
            "name", "\"自作\"",
            "attack", "200",
            "affinity", "-10",
            "element", "{\"type\":\"fire\",\"value\":30}",
            "slots", "[{\"target\":\"weapon\",\"level\":3}]",
            "seriesBonusId", "\"sb:-1305836672\"",
            "groupBonusId", "null");

    private static final String VALID_PAYLOAD = payload(null, null);

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
        jdbc.update("DELETE FROM builds");
        alice = cookies(http.login("400000000000000001"));
        bob = cookies(http.login("400000000000000002"));
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

    private static Map<String, String> map(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }

    private static String obj(Map<String, String> defaults, String key, String value) {
        Map<String, String> m = new LinkedHashMap<>(defaults);
        if (key != null) {
            if (value == null) {
                m.remove(key);
            } else {
                m.put(key, value);
            }
        }
        return m.entrySet().stream()
                .map(e -> "\"" + e.getKey() + "\":" + e.getValue())
                .collect(Collectors.joining(",", "{", "}"));
    }

    /** key を value に差し替えた payload。value が null ならそのキーを省く。 */
    private static String payload(String key, String value) {
        return obj(PAYLOAD_DEFAULTS, key, value);
    }

    private static String weaponPayload(String key, String value) {
        return payload(
                "weapon",
                "{\"kind\":\"custom\",\"id\":\"" + CHARM_ID + "\",\"payload\":" + obj(CUSTOM_DEFAULTS, key, value)
                        + "}");
    }

    private static String repeat(String item, int n) {
        return "[" + IntStream.range(0, n).mapToObj(i -> item).collect(Collectors.joining(",")) + "]";
    }

    private static String skills(int n) {
        return "["
                + IntStream.range(0, n)
                        .mapToObj(i -> "{\"skillId\":\"sk:" + i + "\",\"level\":1,\"rawLevel\":1}")
                        .collect(Collectors.joining(","))
                + "]";
    }

    private static String conditions(int n) {
        return "[" + IntStream.range(0, n).mapToObj(i -> "\"cd:c" + i + "\"").collect(Collectors.joining(",")) + "]";
    }

    /** JSON の文字列リテラル。ASCII の英数字と空白以外は \\uXXXX にして、空白類を確実に送る。 */
    private static String q(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c >= 0x20 && c < 0x7f && c != '"' && c != '\\') {
                sb.append(c);
            } else {
                sb.append(String.format("\\u%04x", (int) c));
            }
        }
        return sb.append('"').toString();
    }

    private static String createBody(Object id, String name, String payload) {
        return "{\"id\":\"" + id + "\",\"name\":" + name + ",\"masterVersion\":\"" + MASTER_VERSION + "\",\"payload\":"
                + payload + ",\"schemaVersion\":1}";
    }

    private static String renameBody(String name, int version) {
        return "{\"name\":" + name + ",\"version\":" + version + "}";
    }

    private Res call(String method, String path, String cookies, String body) throws Exception {
        return http.sendJson(method, path, cookies, cookies == null ? null : XSRF, body);
    }

    private Res create(String cookies, UUID id, String name, String payload) throws Exception {
        return call("POST", BUILDS, cookies, createBody(id, name, payload));
    }

    private Res create(String cookies, UUID id) throws Exception {
        return create(cookies, id, q(NAME), VALID_PAYLOAD);
    }

    private JsonNode json(Res res) {
        return mapper.readTree(res.body());
    }

    private int rows(UUID id) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM builds WHERE id = ?", Integer.class, id);
        return n == null ? 0 : n;
    }

    private long totalRows() {
        Long n = jdbc.queryForObject("SELECT count(*) FROM builds", Long.class);
        return n == null ? 0 : n;
    }

    private int rowVersion(UUID id) {
        Integer v = jdbc.queryForObject(SELECT_ONE.formatted("version"), Integer.class, id);
        return v == null ? -1 : v;
    }

    private String rowName(UUID id) {
        return jdbc.queryForObject(SELECT_ONE.formatted("name"), String.class, id);
    }

    private String rowPayload(UUID id) {
        return jdbc.queryForObject(SELECT_ONE.formatted("payload::text"), String.class, id);
    }

    private boolean isDeleted(UUID id) {
        Boolean b = jdbc.queryForObject(SELECT_ONE.formatted("deleted_at IS NOT NULL"), Boolean.class, id);
        return Boolean.TRUE.equals(b);
    }

    private Set<String> keys(String expr, UUID id) {
        return Set.copyOf(
                jdbc.queryForList("SELECT jsonb_object_keys(" + expr + ") FROM builds WHERE id = ?", String.class, id));
    }

    // AC-1, AC-14: 作成・一覧・名前の変更・削除の往復。サーバーの値（version・日時）と payload の返却。
    @Test
    void createListRenameDeleteRoundTrip() throws Exception {
        UUID id = id(1);

        Res created = create(alice, id);
        assertThat(created.status()).isEqualTo(201);
        assertThat(created.header("Content-Type")).startsWith("application/json");
        JsonNode c = json(created);
        assertThat(c.get("id").asString()).isEqualTo(id.toString());
        assertThat(c.get("name").asString()).isEqualTo(NAME);
        assertThat(c.get("masterVersion").asString()).isEqualTo(MASTER_VERSION);
        assertThat(c.get("schemaVersion").asInt()).isEqualTo(1);
        assertThat(c.get("version").asInt()).isZero();
        assertThat(c.get("payload").get("weapon").get("kind").asString()).isEqualTo("master");
        assertThat(c.get("payload")
                        .get("charm")
                        .get("payload")
                        .get("skills")
                        .get(0)
                        .get("skillId")
                        .asString())
                .isEqualTo("sk:-397570464");
        assertThat(c.get("createdAt").asString()).isNotEmpty();

        JsonNode listed = json(call("GET", BUILDS, alice, null));
        assertThat(listed.size()).isEqualTo(1);
        assertThat(listed.get(0).get("payload").get("skills").size()).isEqualTo(2);

        Res renamed = call("PATCH", BUILDS + "/" + id, alice, renameBody(q("新しい名前"), 0));
        assertThat(renamed.status()).isEqualTo(200);
        JsonNode r = json(renamed);
        assertThat(r.get("name").asString()).isEqualTo("新しい名前");
        assertThat(r.get("version").asInt()).isEqualTo(1);
        assertThat(r.get("createdAt").asString()).isEqualTo(c.get("createdAt").asString());
        assertThat(r.get("updatedAt").asString())
                .isNotEqualTo(c.get("updatedAt").asString());
        assertThat(r.get("payload")).isEqualTo(c.get("payload"));
        assertThat(rowVersion(id)).isEqualTo(1);

        assertThat(call("DELETE", BUILDS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(json(call("GET", BUILDS, alice, null)).size()).isZero();
    }

    // AC-1, AC-14: 一覧は自分の削除していない行だけを ID の降順で返す。version・日時は要求の値を使わない。
    @Test
    void listIsOwnUndeletedDescendingAndIgnoresClientManagedFields() throws Exception {
        create(alice, id(1));
        create(alice, id(3));
        create(alice, id(2));
        create(alice, id(4));
        create(bob, id(5));
        call("DELETE", BUILDS + "/" + id(4), alice, null);
        String withManaged = createBody(id(6), q(NAME), VALID_PAYLOAD)
                .replace(
                        "\"schemaVersion\":1",
                        "\"schemaVersion\":1,\"version\":9,\"createdAt\":\"2000-01-01T00:00:00Z\"");
        Res managed = call("POST", BUILDS, alice, withManaged);
        assertThat(managed.status()).isEqualTo(201);
        assertThat(json(managed).get("version").asInt()).isZero();
        assertThat(json(managed).get("createdAt").asString()).doesNotStartWith("2000");

        JsonNode listed = json(call("GET", BUILDS, alice, null));

        List<String> ids = listed.valueStream().map(n -> n.get("id").asString()).toList();
        assertThat(ids).containsExactly(id(6).toString(), id(3).toString(), id(2).toString(), id(1).toString());
    }

    // AC-7, AC-9（404）, AC-10（204）: 他のユーザーの構成は、一覧に出ず、名前の変更は 404、削除は 204 で、行は変わらない。
    @Test
    void otherUsersBuildIsIsolated() throws Exception {
        UUID id = id(1);
        create(bob, id);

        assertThat(json(call("GET", BUILDS, alice, null)).size()).isZero();
        assertThat(call("PATCH", BUILDS + "/" + id, alice, renameBody(q("乗っ取り"), 0))
                        .status())
                .isEqualTo(404);
        assertThat(call("DELETE", BUILDS + "/" + id, alice, null).status()).isEqualTo(204);

        assertThat(rowName(id)).isEqualTo(NAME);
        assertThat(rowVersion(id)).isZero();
        assertThat(isDeleted(id)).isFalse();
    }

    // AC-8: ID が自分の行・他のユーザーの行・削除済みの行と衝突したら 409 で、既存の行を変えない。
    @Test
    void createWithCollidingIdIsConflict() throws Exception {
        UUID mine = id(1);
        UUID others = id(2);
        UUID deleted = id(3);
        create(alice, mine);
        create(bob, others);
        create(alice, deleted);
        call("DELETE", BUILDS + "/" + deleted, alice, null);

        for (UUID id : List.of(mine, others, deleted)) {
            Res res = create(alice, id, q("上書き"), VALID_PAYLOAD);
            assertThat(res.status()).as("id=%s", id).isEqualTo(409);
            assertThat(res.header("Content-Type")).startsWith("application/problem+json");
            assertThat(json(res).get("detail").asString()).isEqualTo("Build id already exists");
            assertThat(rowName(id)).isEqualTo(NAME);
        }
        assertThat(isDeleted(deleted)).isTrue();
    }

    // AC-9: 行バージョンの不一致は 409 で上書きしない。
    @Test
    void renameWithStaleVersionIsConflict() throws Exception {
        UUID id = id(1);
        create(alice, id);
        call("PATCH", BUILDS + "/" + id, alice, renameBody(q("一回目"), 0));

        Res res = call("PATCH", BUILDS + "/" + id, alice, renameBody(q("二回目"), 0));

        assertThat(res.status()).isEqualTo(409);
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(json(res).get("detail").asString()).isEqualTo("Build was changed by another request");
        assertThat(rowName(id)).isEqualTo("一回目");
        assertThat(rowVersion(id)).isEqualTo(1);
    }

    // AC-9: 自分の削除していない行が無い（存在しない・削除済み・UUID でない ID）名前の変更は 404。
    @Test
    void renameOfMissingDeletedOrMalformedIdIsNotFound() throws Exception {
        UUID deleted = id(1);
        create(alice, deleted);
        call("DELETE", BUILDS + "/" + deleted, alice, null);

        for (String target : List.of(id(2).toString(), deleted.toString(), "not-a-uuid")) {
            Res res = call("PATCH", BUILDS + "/" + target, alice, renameBody(q("名前"), 0));
            assertThat(res.status()).as("id=%s", target).isEqualTo(404);
            assertThat(res.header("Content-Type")).startsWith("application/problem+json");
            assertThat(json(res).get("detail").asString()).isEqualTo("Build not found");
        }
    }

    // AC-10: 論理削除で、行バージョンを進め、何度でも・存在しない ID でも 204。削除後は生き返らない。
    @Test
    void deleteIsLogicalIdempotentAndBumpsVersion() throws Exception {
        UUID id = id(1);
        create(alice, id);

        assertThat(call("DELETE", BUILDS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", BUILDS + "/" + id, alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", BUILDS + "/" + id(2), alice, null).status()).isEqualTo(204);
        assertThat(call("DELETE", BUILDS + "/not-a-uuid", alice, null).status()).isEqualTo(204);

        assertThat(rows(id)).isEqualTo(1);
        assertThat(isDeleted(id)).isTrue();
        assertThat(rowVersion(id)).isEqualTo(1);
        assertThat(call("PATCH", BUILDS + "/" + id, alice, renameBody(q("復活"), 0))
                        .status())
                .isEqualTo(404);
        assertThat(isDeleted(id)).isTrue();
    }

    // AC-11: 構成名の境界の内側（コードポイント 1〜50・ES の空白でない端・内側の空白）は保存できる。
    @ParameterizedTest
    @MethodSource("validNames")
    void validNamesAreAccepted(String name) throws Exception {
        UUID id = id(1);

        Res res = create(alice, id, q(name), VALID_PAYLOAD);

        assertThat(res.status()).as(name).isEqualTo(201);
        assertThat(rowName(id)).isEqualTo(name);
    }

    static Stream<String> validNames() {
        return Stream.of(
                NAME,
                "a",
                "a".repeat(50),
                "😀".repeat(50),
                "a b",
                "a" + cp(0xA0) + "b",
                // ES の trim が除かない文字（Java の \s・isWhitespace の集合とは違う）は端にあっても可。
                "a" + cp(0x200B),
                cp(0x85) + "a",
                cp(0x1F) + "a");
    }

    /** ソース中のエスケープや不可視文字に頼らず、コードポイントから文字列を作る。 */
    private static String cp(int codePoint) {
        return Character.toString(codePoint);
    }

    // AC-11: 構成名の違反（空・51 コードポイント・端の ES の空白・null・文字列でない）は 400 で、保存しない。
    @ParameterizedTest
    @MethodSource("invalidNames")
    void invalidNamesAreRejected(String nameJson) throws Exception {
        UUID id = id(1);
        Res created = call("POST", BUILDS, alice, createBody(id, nameJson, VALID_PAYLOAD));
        assertThat(created.status()).as(nameJson).isEqualTo(400);
        assertThat(created.header("Content-Type")).startsWith("application/problem+json");
        assertThat(rows(id)).isZero();

        create(alice, id);
        Res renamed = call("PATCH", BUILDS + "/" + id, alice, renameBody(nameJson, 0));
        assertThat(renamed.status()).as(nameJson).isEqualTo(400);
        assertThat(rowName(id)).isEqualTo(NAME);
        assertThat(rowVersion(id)).isZero();
    }

    static Stream<String> invalidNames() {
        return Stream.of(
                q(""),
                q("a".repeat(51)),
                q("😀".repeat(51)),
                q(cp(0x20) + "a"),
                q("a" + cp(0x20)),
                q("a" + cp(0x0A)),
                q(cp(0x09) + "a"),
                q(cp(0x0B) + "a"),
                q(cp(0xA0) + "a"),
                q("a" + cp(0xA0)),
                q(cp(0x3000) + "構成"),
                q("構成" + cp(0x3000)),
                q(cp(0xFEFF) + "a"),
                q("a" + cp(0x2003)),
                q(cp(0x2028) + "a"),
                q("a" + cp(0x1680)),
                q("a" + cp(0x202F)),
                "null",
                "[]");
    }

    // AC-11: payload の構造の境界の内側は保存できる（負の ID・護石なし・属性なし・各配列の上限）。
    @ParameterizedTest
    @MethodSource("validPayloads")
    void boundaryValidPayloadsAreAccepted(String payload) throws Exception {
        UUID id = id(1);

        Res res = create(alice, id, q(NAME), payload);

        assertThat(res.status()).as(payload).isEqualTo(201);
        assertThat(rows(id)).isEqualTo(1);
    }

    static Stream<String> validPayloads() {
        String maxSlots = "[{\"target\":\"weapon\",\"level\":1},{\"target\":\"weapon\",\"level\":2},"
                + "{\"target\":\"weapon\",\"level\":3}]";
        return Stream.of(
                VALID_PAYLOAD,
                payload("charm", "null"),
                payload("decorations", "[]"),
                payload("decorations", repeat(DECORATION, 21)),
                payload("freeSlots", repeat(SLOT_REF, 21)),
                payload("skills", skills(100)),
                payload("skills", "[]"),
                payload("activeConditionIds", conditions(50)),
                payload("activeConditionIds", "[]"),
                payload("armor", "{\"head\":null,\"chest\":null,\"arms\":null,\"waist\":null,\"legs\":\"ar:5:legs\"}"),
                payload("weapon", "{\"kind\":\"master\",\"weaponId\":\"wp:bow:1\"}"),
                weaponPayload(null, null),
                weaponPayload("element", null),
                weaponPayload("name", "\"\""),
                weaponPayload("name", q("あ".repeat(30))),
                weaponPayload("name", q("😀".repeat(30))),
                weaponPayload("attack", "999"),
                weaponPayload("attack", "1"),
                weaponPayload("affinity", "100"),
                weaponPayload("affinity", "-100"),
                weaponPayload("element", "{\"type\":\"blastblight\",\"value\":99}"),
                weaponPayload("slots", maxSlots),
                weaponPayload("slots", "[]"),
                weaponPayload("groupBonusId", "\"sb:12\""));
    }

    // AC-11: payload の構造の違反（欠落・null・型・pattern・範囲・上限・重複・rawLevel < level・未知の kind）は 400。
    @ParameterizedTest
    @MethodSource("invalidPayloads")
    void invalidPayloadIsRejectedWithBadRequest(String payload) throws Exception {
        UUID id = id(1);

        Res res = create(alice, id, q(NAME), payload);

        assertThat(res.status()).as(payload).isEqualTo(400);
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(rows(id)).isZero();
    }

    static Stream<String> invalidPayloads() {
        return Stream.concat(
                Stream.concat(invalidTopLevel(), invalidWeapons()), Stream.concat(invalidLists(), invalidSkills()));
    }

    private static Stream<String> invalidTopLevel() {
        return Stream.of(
                "null",
                "[]",
                "{}",
                payload("weapon", null),
                payload("armor", null),
                payload("decorations", null),
                payload("skills", null),
                payload("freeSlots", null),
                payload("activeConditionIds", null),
                payload("weapon", "null"),
                payload("armor", "null"),
                payload("decorations", "null"),
                payload("skills", "null"),
                payload("freeSlots", "null"),
                payload("activeConditionIds", "null"),
                payload("armor", "{\"head\":\"ar:1:foot\"}"),
                payload("armor", "{\"head\":\"ar:x:head\"}"),
                payload("armor", "{\"head\":5}"),
                payload("charm", null),
                payload("armor", "{\"chest\":null,\"arms\":null,\"waist\":null,\"legs\":null}"),
                payload("armor", "{\"head\":null,\"arms\":null,\"waist\":null,\"legs\":null}"),
                payload("armor", "{\"head\":null,\"chest\":null,\"waist\":null,\"legs\":null}"),
                payload("armor", "{\"head\":null,\"chest\":null,\"arms\":null,\"legs\":null}"),
                payload("armor", "{\"head\":null,\"chest\":null,\"arms\":null,\"waist\":null}"),
                payload("charm", "{\"id\":\"not-a-uuid\",\"payload\":" + CHARM_PAYLOAD + "}"),
                payload("charm", "{\"payload\":" + CHARM_PAYLOAD + "}"),
                payload("charm", "{\"id\":\"" + CHARM_ID + "\"}"),
                payload("charm", "{\"id\":\"" + CHARM_ID + "\",\"payload\":{\"rarity\":4,\"skills\":[],\"slots\":[]}}"),
                payload(
                        "charm",
                        "{\"id\":\"" + CHARM_ID
                                + "\",\"payload\":{\"rarity\":8,\"skills\":[{\"skillId\":\"sk:--1\",\"level\":1}],\"slots\":[]}}"));
    }

    private static Stream<String> invalidWeapons() {
        return Stream.of(
                payload("weapon", "{\"kind\":\"unknown\",\"weaponId\":\"wp:bow:1\"}"),
                payload("weapon", "{\"weaponId\":\"wp:bow:1\"}"),
                payload("weapon", "{\"kind\":null,\"weaponId\":\"wp:bow:1\"}"),
                payload("weapon", "{\"kind\":\"master\"}"),
                payload("weapon", "{\"kind\":\"master\",\"weaponId\":\"bow:1\"}"),
                payload("weapon", "{\"kind\":\"master\",\"weaponId\":\"wp:Bow:1\"}"),
                payload("weapon", "{\"kind\":\"master\",\"weaponId\":\"wp:bow:x\"}"),
                payload(
                        "weapon",
                        "{\"kind\":\"custom\",\"id\":\"not-a-uuid\",\"payload\":" + obj(CUSTOM_DEFAULTS, null, null)
                                + "}"),
                payload("weapon", "{\"kind\":\"custom\",\"payload\":" + obj(CUSTOM_DEFAULTS, null, null) + "}"),
                payload("weapon", "{\"kind\":\"custom\",\"id\":\"" + CHARM_ID + "\"}"),
                weaponPayload("baseWeaponId", "\"bow:1\""),
                weaponPayload("baseWeaponId", null),
                weaponPayload("name", null),
                weaponPayload("name", q("あ".repeat(31))),
                weaponPayload("name", q("😀".repeat(31))),
                weaponPayload("attack", "0"),
                weaponPayload("attack", "1000"),
                weaponPayload("attack", null),
                weaponPayload("affinity", "101"),
                weaponPayload("affinity", "-101"),
                weaponPayload("element", "{\"type\":\"wind\",\"value\":30}"),
                weaponPayload("element", "{\"type\":\"fire\",\"value\":0}"),
                weaponPayload("element", "{\"type\":\"fire\",\"value\":100}"),
                weaponPayload("element", "{\"type\":\"fire\"}"),
                weaponPayload("element", "{\"value\":30}"),
                weaponPayload("slots", repeat("{\"target\":\"weapon\",\"level\":1}", 4)),
                weaponPayload("slots", "[{\"target\":\"armor\",\"level\":1}]"),
                weaponPayload("slots", "[{\"target\":\"weapon\",\"level\":4}]"),
                weaponPayload("slots", "[{\"target\":\"weapon\",\"level\":0}]"),
                weaponPayload("slots", null),
                weaponPayload("seriesBonusId", null),
                weaponPayload("groupBonusId", null),
                weaponPayload("seriesBonusId", "\"sk:1\""),
                weaponPayload("groupBonusId", "\"sb:x\""));
    }

    private static Stream<String> invalidLists() {
        return Stream.of(
                payload("decorations", repeat(DECORATION, 22)),
                payload("decorations", "[null]"),
                payload("decorations", "[{\"slot\":{\"owner\":\"head\",\"index\":3},\"decorationId\":\"dc:1\"}]"),
                payload("decorations", "[{\"slot\":{\"owner\":\"head\",\"index\":-1},\"decorationId\":\"dc:1\"}]"),
                payload("decorations", "[{\"slot\":{\"owner\":\"feet\",\"index\":0},\"decorationId\":\"dc:1\"}]"),
                payload("decorations", "[{\"slot\":{\"index\":0},\"decorationId\":\"dc:1\"}]"),
                payload("decorations", "[{\"decorationId\":\"dc:1\"}]"),
                payload("decorations", "[{\"slot\":{\"owner\":\"head\",\"index\":0},\"decorationId\":\"sk:1\"}]"),
                payload("decorations", "[{\"slot\":{\"owner\":\"head\",\"index\":0}}]"),
                payload("freeSlots", repeat(SLOT_REF, 22)),
                payload("freeSlots", "[{\"owner\":\"charm\",\"index\":3}]"),
                payload("activeConditionIds", conditions(51)),
                payload("activeConditionIds", "[\"cd:weak_point\",\"cd:weak_point\"]"),
                payload("activeConditionIds", "[\"CD:weak\"]"),
                payload("activeConditionIds", "[\"cd:\"]"),
                payload("activeConditionIds", "[null]"),
                payload("activeConditionIds", "[5]"));
    }

    private static Stream<String> invalidSkills() {
        return Stream.of(
                payload("skills", skills(101)),
                payload("skills", "[" + SKILL + "," + SKILL + "]"),
                payload("skills", "[null]"),
                payload("skills", "[{\"skillId\":\"sk:1\",\"level\":3,\"rawLevel\":2}]"),
                payload("skills", "[{\"skillId\":\"sk:1\",\"level\":0,\"rawLevel\":1}]"),
                payload("skills", "[{\"skillId\":\"sk:1\",\"level\":1,\"rawLevel\":0}]"),
                payload("skills", "[{\"skillId\":\"sk:1\",\"level\":1}]"),
                payload("skills", "[{\"skillId\":\"sk:1\",\"rawLevel\":1}]"),
                payload("skills", "[{\"level\":1,\"rawLevel\":1}]"),
                payload("skills", "[{\"skillId\":\"sk:x\",\"level\":1,\"rawLevel\":1}]"),
                payload("skills", "[{\"skillId\":\"sk:-\",\"level\":1,\"rawLevel\":1}]"),
                payload("skills", "[{\"skillId\":\"dc:1\",\"level\":1,\"rawLevel\":1}]"),
                payload("skills", "[{\"skillId\":\"sk:1\",\"level\":\"1\",\"rawLevel\":1}]"));
    }

    // AC-11: ID・masterVersion・スキーマ版の不備と、JSON として読めない本文は 400 で、保存しない。
    @ParameterizedTest
    @MethodSource("invalidEnvelopes")
    void invalidCreateEnvelopeIsRejected(String body) throws Exception {
        Res res = call("POST", BUILDS, alice, body);

        assertThat(res.status()).as(body).isEqualTo(400);
        assertThat(res.header("Content-Type")).startsWith("application/problem+json");
        assertThat(totalRows()).isZero();
    }

    static Stream<String> invalidEnvelopes() {
        UUID v7 = id(1);
        UUID v4 = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
        UUID v7BadVariant = new UUID(v7.getMostSignificantBits(), 0x4000_0000_0000_0001L);
        String name = q(NAME);
        String ok = createBody(v7, name, VALID_PAYLOAD);
        return Stream.of(
                createBody(v4, name, VALID_PAYLOAD),
                createBody(v7BadVariant, name, VALID_PAYLOAD),
                createBody("not-a-uuid", name, VALID_PAYLOAD),
                ok.replace("\"id\":\"" + v7 + "\"", "\"id\":null"),
                ok.replace("\"id\":\"" + v7 + "\",", ""),
                ok.replace("\"name\":" + name + ",", ""),
                ok.replace("\"masterVersion\":\"" + MASTER_VERSION + "\",", ""),
                ok.replace(MASTER_VERSION, ""),
                ok.replace(MASTER_VERSION, "2026.10"),
                ok.replace(MASTER_VERSION, "v2026.10.4"),
                ok.replace(MASTER_VERSION, "2026.10.4-beta"),
                ok.replace(MASTER_VERSION, "1.".repeat(20) + "1"),
                ok.replace("\"masterVersion\":\"" + MASTER_VERSION + "\"", "\"masterVersion\":null"),
                ok.replace("\"masterVersion\":\"" + MASTER_VERSION + "\"", "\"masterVersion\":4"),
                ok.replace("\"schemaVersion\":1", "\"schemaVersion\":2"),
                ok.replace("\"schemaVersion\":1", "\"schemaVersion\":0"),
                ok.replace(",\"schemaVersion\":1", ""),
                ok.replace("\"payload\":" + VALID_PAYLOAD, "\"payload\":null"),
                ok.replace(",\"payload\":" + VALID_PAYLOAD, ""),
                ok.substring(0, ok.length() - 1),
                "");
    }

    // AC-11: 名前の変更の行バージョンの不備は 400。
    @ParameterizedTest
    @MethodSource("invalidRenameEnvelopes")
    void invalidRenameEnvelopeIsRejected(String body) throws Exception {
        UUID id = id(1);
        create(alice, id);

        Res res = call("PATCH", BUILDS + "/" + id, alice, body);

        assertThat(res.status()).as(body).isEqualTo(400);
        assertThat(rowName(id)).isEqualTo(NAME);
        assertThat(rowVersion(id)).isZero();
    }

    static Stream<String> invalidRenameEnvelopes() {
        return Stream.of(
                "{\"name\":\"x\"}",
                "{\"version\":0}",
                "{\"name\":\"x\",\"version\":-1}",
                "{\"name\":\"x\",\"version\":null}",
                "{\"name\":\"x\",\"version\":\"0\"}",
                "{\"name\":\"x\",\"version\":0.5}",
                "{\"name\":\"x\",\"version\":0",
                "");
    }

    // AC-7: 未ログインは 4 つとも 401（problem+json・リダイレクトなし）で、構成を変えない。
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
                Arguments.of("GET", BUILDS, null),
                Arguments.of("POST", BUILDS, createBody(id(1), q(NAME), VALID_PAYLOAD)),
                Arguments.of("PATCH", BUILDS + "/" + id(1), renameBody(q(NAME), 0)),
                Arguments.of("DELETE", BUILDS + "/" + id(1), null));
    }

    // AC-7: CSRF トークンの無い POST・PATCH・DELETE は 403 で拒否し、構成を変えない。
    @Test
    void mutationsWithoutCsrfTokenAreForbidden() throws Exception {
        UUID id = id(1);
        create(alice, id);
        String sessionOnly = alice.substring(0, alice.indexOf(';'));

        Res post = http.sendJson("POST", BUILDS, sessionOnly, null, createBody(id(2), q(NAME), VALID_PAYLOAD));
        Res patch = http.sendJson("PATCH", BUILDS + "/" + id, sessionOnly, null, renameBody(q("変更"), 0));
        Res delete = http.sendJson("DELETE", BUILDS + "/" + id, sessionOnly, null, null);

        assertThat(List.of(post.status(), patch.status(), delete.status())).containsOnly(403);
        assertThat(rows(id(2))).isZero();
        assertThat(rowName(id)).isEqualTo(NAME);
        assertThat(rowVersion(id)).isZero();
        assertThat(isDeleted(id)).isFalse();
    }

    // AC-14: payload の jsonb に書かれるキーは Web の形と一致する（省略可の element は無ければ書かない）。
    @Test
    void payloadIsStoredWithTheWebKeys() throws Exception {
        UUID master = id(1);
        UUID custom = id(2);
        create(alice, master);
        create(alice, custom, q(NAME), weaponPayload("element", null));

        assertThat(keys("payload", master))
                .containsExactlyInAnyOrder(
                        "weapon", "armor", "charm", "decorations", "skills", "freeSlots", "activeConditionIds");
        assertThat(keys("payload->'weapon'", master)).containsExactlyInAnyOrder("kind", "weaponId");
        assertThat(keys("payload->'armor'", master))
                .containsExactlyInAnyOrder("head", "chest", "arms", "waist", "legs");
        assertThat(keys("payload->'charm'", master)).containsExactlyInAnyOrder("id", "payload");
        assertThat(keys("payload->'charm'->'payload'", master)).containsExactlyInAnyOrder("rarity", "skills", "slots");
        assertThat(keys("payload->'decorations'->0", master)).containsExactlyInAnyOrder("slot", "decorationId");
        assertThat(keys("payload->'decorations'->0->'slot'", master)).containsExactlyInAnyOrder("owner", "index");
        assertThat(keys("payload->'skills'->0", master)).containsExactlyInAnyOrder("skillId", "level", "rawLevel");
        assertThat(keys("payload->'freeSlots'->0", master)).containsExactlyInAnyOrder("owner", "index");
        assertThat(keys("payload->'weapon'", custom)).containsExactlyInAnyOrder("kind", "id", "payload");
        assertThat(keys("payload->'weapon'->'payload'", custom))
                .containsExactlyInAnyOrder(
                        "baseWeaponId", "name", "attack", "affinity", "slots", "seriesBonusId", "groupBonusId");
        assertThat(rowPayload(master)).contains("\"activeConditionIds\": [\"cd:weak_point\", \"cd:xu_wus_vigor\"]");
        assertThat(jdbc.queryForObject(SELECT_ONE.formatted("schema_version"), Integer.class, master))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(SELECT_ONE.formatted("master_version"), String.class, master))
                .isEqualTo(MASTER_VERSION);
    }
}

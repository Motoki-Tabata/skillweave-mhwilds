package io.github.motokitabata.skillweave.controller;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.support.DiscordHttp;
import io.github.motokitabata.skillweave.support.DiscordHttp.Res;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
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

/** 共有の閲覧の API（012 build-share。受入基準 AC-7, 10, 11, 14）。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class SharedBuildControllerTest {

    private static final String VIEW = "/api/shared-builds/";
    private static final String XSRF = "x";
    private static final String NAME = "元の名前";
    private static final UUID BUILD_ID = UUID.fromString("01900000-0001-7000-8000-000000000001");
    private static final UUID SHARE_ID = UUID.fromString("01900000-0002-7000-8000-000000000002");
    private static final String PAYLOAD = "{\"weapon\":{\"kind\":\"master\",\"weaponId\":\"wp:charge-blade:22\"},"
            + "\"armor\":{\"head\":null,\"chest\":null,\"arms\":null,\"waist\":null,\"legs\":null},\"charm\":null,"
            + "\"decorations\":[],\"skills\":[],\"freeSlots\":[],\"activeConditionIds\":[]}";

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
    private String shortId;

    @BeforeEach
    void setUp() throws Exception {
        http = new DiscordHttp(port, tokenClient, fetcher);
        clean();
        alice = DiscordHttp.SESSION + "=" + http.login("400000000000000001") + "; XSRF-TOKEN=" + XSRF;
        String body = "{\"id\":\"" + BUILD_ID + "\",\"name\":\"" + NAME
                + "\",\"masterVersion\":\"2026.10.4\",\"payload\":" + PAYLOAD + ",\"schemaVersion\":1}";
        assertThat(call("POST", "/api/builds", body).status()).isEqualTo(201);
        Res shared = call("POST", "/api/shares", "{\"id\":\"" + SHARE_ID + "\",\"buildId\":\"" + BUILD_ID + "\"}");
        shortId = mapper.readTree(shared.body()).get("shortId").asString();
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM shares");
        jdbc.update("DELETE FROM builds");
    }

    private Res call(String method, String path, String body) throws Exception {
        return http.sendJson(method, path, alice, XSRF, body);
    }

    private Res anonymous(String method, String path) throws Exception {
        return http.send(method, path, null, null);
    }

    // AC-11: 未ログインで 200 と、5 項目だけの応答（行の ID・元の構成の ID・作成者を含まない）。
    @Test
    void anonymousViewReturnsOnlyFiveFields() throws Exception {
        Res res = anonymous("GET", VIEW + shortId);

        assertThat(res.status()).isEqualTo(200);
        JsonNode v = mapper.readTree(res.body());
        assertThat(v.propertyNames())
                .containsExactlyInAnyOrder("name", "masterVersion", "payload", "schemaVersion", "createdAt");
        assertThat(v.get("name").asString()).isEqualTo(NAME);
        assertThat(v.get("masterVersion").asString()).isEqualTo("2026.10.4");
        assertThat(v.get("schemaVersion").asInt()).isEqualTo(1);
        assertThat(res.body()).doesNotContain(SHARE_ID.toString()).doesNotContain(BUILD_ID.toString());
    }

    // AC-11: ログイン中でも同じ応答。HEAD も 200。
    @Test
    void loggedInViewIsSameAndHeadIs200() throws Exception {
        assertThat(call("GET", VIEW + shortId, null).body())
                .isEqualTo(anonymous("GET", VIEW + shortId).body());
        assertThat(anonymous("HEAD", VIEW + shortId).status()).isEqualTo(200);
    }

    // AC-10: 取り消し済み・不在・形の違う短縮 ID は区別せず 404。
    @ParameterizedTest
    @ValueSource(strings = {"Ab3dE6gH9jK2", "Ab3dE6gH9jK", "Ab3dE6gH9j-2", "Ab3dE6gH9jK2x"})
    void unknownOrMalformedShortIdIs404(String id) throws Exception {
        assertThat(anonymous("GET", VIEW + id).status()).isEqualTo(404);
    }

    @Test
    void revokedShareIs404() throws Exception {
        call("DELETE", "/api/shares/" + SHARE_ID, null);

        assertThat(anonymous("GET", VIEW + shortId).status()).isEqualTo(404);
    }

    // AC-7: 元の構成の名前の変更と削除の後も閲覧の内容は変わらず、共有は残る。
    @Test
    void viewIsUnchangedAfterBuildRenameAndDelete() throws Exception {
        String before = anonymous("GET", VIEW + shortId).body();

        assertThat(call("PATCH", "/api/builds/" + BUILD_ID, "{\"name\":\"別の名前\",\"version\":0}")
                        .status())
                .isEqualTo(200);
        assertThat(anonymous("GET", VIEW + shortId).body()).isEqualTo(before);

        assertThat(call("DELETE", "/api/builds/" + BUILD_ID, null).status()).isEqualTo(204);
        assertThat(anonymous("GET", VIEW + shortId).body()).isEqualTo(before);
        assertThat(mapper.readTree(call("GET", "/api/shares", null).body()).size())
                .isEqualTo(1);
    }
}

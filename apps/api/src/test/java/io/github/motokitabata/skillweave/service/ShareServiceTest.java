package io.github.motokitabata.skillweave.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.dto.request.CreateShareRequest;
import io.github.motokitabata.skillweave.repository.ShareRepository;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** 共有の作成で、短縮 ID の衝突は採番し直し、ID の衝突は 409 になること（AC-2, AC-4）。 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class ShareServiceTest {

    private static final UUID BUILD_ID = UUID.fromString("01900000-0001-7000-8000-000000000001");
    private static final UUID BUILD_2 = UUID.fromString("01900000-0001-7000-8000-000000000002");
    private static final UUID SHARE_ID = UUID.fromString("01900000-0002-7000-8000-000000000001");
    private static final UUID SHARE_2 = UUID.fromString("01900000-0002-7000-8000-000000000002");
    private static final String PAYLOAD = "{\"weapon\":{\"kind\":\"master\",\"weaponId\":\"wp:charge-blade:22\"},"
            + "\"armor\":{\"head\":null,\"chest\":null,\"arms\":null,\"waist\":null,\"legs\":null},\"charm\":null,"
            + "\"decorations\":[],\"skills\":[],\"freeSlots\":[],\"activeConditionIds\":[]}";
    private static final String TAKEN = "Taken0000001";
    private static final String FRESH = "Fresh0000001";

    @Autowired
    private ShareService service;

    @MockitoBean
    private ShortIdGenerator generator;

    @MockitoSpyBean
    private ShareRepository shares;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID userId;

    @BeforeEach
    void setUp() {
        clean();
        userId = jdbc.queryForObject(
                "INSERT INTO users (discord_id) VALUES ('400000000000000001')"
                        + " ON CONFLICT (discord_id) DO UPDATE SET discord_id = EXCLUDED.discord_id RETURNING id",
                UUID.class);
        for (UUID b : new UUID[] {BUILD_ID, BUILD_2}) {
            jdbc.update(
                    "INSERT INTO builds (id, user_id, name, master_version, payload, schema_version)"
                            + " VALUES (?, ?, '構成', '1.0.0', ?::jsonb, 1)",
                    b,
                    userId,
                    PAYLOAD);
        }
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM shares");
        jdbc.update("DELETE FROM builds");
    }

    private void insertRevokedShare() {
        jdbc.update(
                "INSERT INTO shares (id, short_id, user_id, build_id, name, master_version, payload, schema_version,"
                        + " deleted_at) VALUES (?, ?, ?, ?, '旧', '1.0.0', ?::jsonb, 1, now())",
                SHARE_ID,
                TAKEN,
                userId,
                BUILD_ID,
                PAYLOAD);
    }

    // AC-2: 取り消した共有の短縮 ID と衝突しても採番し直して作れ、取り消した行の短縮 ID は変わらない。
    @Test
    void shortIdCollisionWithRevokedShareIsRetried() {
        insertRevokedShare();
        when(generator.generate()).thenReturn(TAKEN, FRESH);

        var result = service.create(userId, new CreateShareRequest(SHARE_2, BUILD_ID));

        assertThat(result.created()).isTrue();
        assertThat(result.share().shortId()).isEqualTo(FRESH);
        assertThat(jdbc.queryForObject("SELECT short_id FROM shares WHERE id = ?", String.class, SHARE_ID))
                .isEqualTo(TAKEN);
    }

    // AC-2: 衝突が続いて上限を超えたら、変換せずに例外を上げる。
    @Test
    void shortIdCollisionBeyondLimitThrows() {
        insertRevokedShare();
        when(generator.generate()).thenReturn(TAKEN);
        var request = new CreateShareRequest(SHARE_2, BUILD_2);

        assertThatThrownBy(() -> service.create(userId, request)).isInstanceOf(DataIntegrityViolationException.class);
        verify(generator, times(ShareService.MAX_SHORT_ID_ATTEMPTS)).generate();
    }

    // AC-4: 事前の判定（existsById）をすり抜けた主キー違反は、INSERT の制約名で分けて 409 になる。
    @Test
    void primaryKeyViolationBecomesConflict() {
        insertRevokedShare();
        when(generator.generate()).thenReturn(FRESH);
        // 事前の判定を false に固定し、INSERT の主キー違反（pk_shares_id）の分岐を通す。
        doReturn(false).when(shares).existsById(SHARE_ID);
        var request = new CreateShareRequest(SHARE_ID, BUILD_2);

        assertThatThrownBy(() -> service.create(userId, request)).isInstanceOf(ResourceConflictException.class);
        verify(shares).existsById(SHARE_ID);
    }

    // AC-2: 事前の判定をすり抜けた同時の作成（uq_shares_build_id）は、既存の共有を読み直して作成なしで返す。
    @Test
    void buildIdViolationReturnsExistingShare() {
        jdbc.update(
                "INSERT INTO shares (id, short_id, user_id, build_id, name, master_version, payload, schema_version)"
                        + " VALUES (?, ?, ?, ?, '既存', '1.0.0', ?::jsonb, 1)",
                SHARE_ID,
                TAKEN,
                userId,
                BUILD_ID,
                PAYLOAD);
        when(generator.generate()).thenReturn(FRESH);
        // 1 回目の事前の確認だけ「まだ無い」を返し、2 回目（INSERT 失敗後の読み直し）は既存の共有を返す。
        var existing = shares.findById(SHARE_ID).orElseThrow();
        doReturn(Optional.empty(), Optional.of(existing)).when(shares).findByBuildIdAndDeletedAtIsNull(BUILD_ID);

        var result = service.create(userId, new CreateShareRequest(SHARE_2, BUILD_ID));

        assertThat(result.created()).isFalse();
        assertThat(result.share().id()).isEqualTo(SHARE_ID);
        assertThat(result.share().shortId()).isEqualTo(TAKEN);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shares", Integer.class))
                .isEqualTo(1);
    }
}

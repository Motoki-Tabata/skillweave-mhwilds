package io.github.motokitabata.skillweave.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.dto.request.CreateCharmRequest;
import io.github.motokitabata.skillweave.dto.request.UpdateCharmRequest;
import io.github.motokitabata.skillweave.entity.Charm;
import io.github.motokitabata.skillweave.entity.CharmPayload;
import io.github.motokitabata.skillweave.repository.CharmRepository;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** 護石の作成で、主キー違反だけが 409 になり、ほかの DB の拒否は ID の衝突に化けないこと。 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class CharmServiceTest {

    private static final UUID ID = UUID.fromString("01900000-0001-7000-8000-000000000001");

    @Autowired
    private CharmService service;

    @MockitoSpyBean
    private CharmRepository repository;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID userId;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM charms");
        userId = jdbc.queryForObject(
                "INSERT INTO users (discord_id) VALUES ('400000000000000001')"
                        + " ON CONFLICT (discord_id) DO UPDATE SET discord_id = EXCLUDED.discord_id RETURNING id",
                UUID.class);
    }

    private static CreateCharmRequest request(int rarity, int schemaVersion) {
        return new CreateCharmRequest(ID, new CharmPayload(rarity, List.of(), List.of()), schemaVersion);
    }

    private int rows() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM charms WHERE id = ?", Integer.class, ID);
        return n == null ? 0 : n;
    }

    /** 存在の確認をすり抜けた同時の作成（確認の後に別の要求が同じ ID を入れた）は、主キー違反を 409 にする。 */
    @Test
    void primaryKeyViolationBecomesConflict() {
        service.create(userId, request(8, 1));
        doReturn(false).when(repository).existsById(ID);

        CreateCharmRequest second = request(5, 1);

        assertThatThrownBy(() -> service.create(userId, second))
                .isInstanceOf(ResourceConflictException.class)
                .hasMessage(CharmService.ID_EXISTS);
        assertThat(jdbc.queryForObject("SELECT payload->>'rarity' FROM charms WHERE id = ?", String.class, ID))
                .isEqualTo("8");
    }

    /**
     * AC-1: 行バージョンの確認の後、保存で本物の楽観ロックの失敗（同時の更新）が起きたときは 409 になる。
     * 取得済みの実体（detach 済み）を finder の戻りに差し替え、確認の前に別の要求が行を更新した状況を作る。
     * 行バージョンの確認は通り、本物の saveAndFlush が Hibernate の失敗を ObjectOptimisticLockingFailureException にする。
     */
    @Test
    void optimisticLockFailureOnUpdateBecomesConflict() {
        int version = service.create(userId, request(8, 1)).version();
        Charm stale = repository.findByIdAndUserIdAndDeletedAtIsNull(ID, userId).orElseThrow();
        jdbc.update(
                "UPDATE charms SET version = version + 1, payload = jsonb_set(payload, '{rarity}', '7') WHERE id = ?",
                ID);
        doReturn(Optional.of(stale)).when(repository).findByIdAndUserIdAndDeletedAtIsNull(ID, userId);

        UpdateCharmRequest update = new UpdateCharmRequest(new CharmPayload(5, List.of(), List.of()), 1, version);

        assertThatThrownBy(() -> service.update(userId, ID, update))
                .isInstanceOf(ResourceConflictException.class)
                .hasCauseInstanceOf(ObjectOptimisticLockingFailureException.class);
        assertThat(jdbc.queryForObject("SELECT payload->>'rarity' FROM charms WHERE id = ?", String.class, ID))
                .isEqualTo("7");
    }

    @Test
    void foreignKeyViolationIsNotConflict() {
        UUID unknownUser = UUID.fromString("01900000-0002-7000-8000-000000000002");

        CreateCharmRequest request = request(8, 1);

        assertThatThrownBy(() -> service.create(unknownUser, request))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(rows()).isZero();
    }

    @Test
    void checkViolationIsNotConflict() {
        CreateCharmRequest request = request(8, 0);

        assertThatThrownBy(() -> service.create(userId, request)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(rows()).isZero();
    }
}

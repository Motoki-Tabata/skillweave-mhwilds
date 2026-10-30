package io.github.motokitabata.skillweave.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.dto.request.CreateCustomWeaponRequest;
import io.github.motokitabata.skillweave.entity.CustomWeaponPayload;
import io.github.motokitabata.skillweave.repository.CustomWeaponRepository;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/** 武器の作成で、主キー違反だけが 409 になり、ほかの DB の拒否は ID の衝突に化けないこと。 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class WeaponServiceTest {

    private static final UUID ID = UUID.fromString("01900000-0001-7000-8000-000000000011");

    @Autowired
    private WeaponService service;

    @MockitoSpyBean
    private CustomWeaponRepository repository;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID userId;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM weapons");
        userId = jdbc.queryForObject(
                "INSERT INTO users (discord_id) VALUES ('400000000000000011')"
                        + " ON CONFLICT (discord_id) DO UPDATE SET discord_id = EXCLUDED.discord_id RETURNING id",
                UUID.class);
    }

    private static CustomWeaponPayload payload(int attack) {
        return new CustomWeaponPayload("w:1", "test", attack, 0, null, List.of(), "sb:1", "sb:2");
    }

    private static CreateCustomWeaponRequest request(CustomWeaponPayload payload, int schemaVersion) {
        return new CreateCustomWeaponRequest(ID, payload, schemaVersion);
    }

    private int rows() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM weapons WHERE id = ?", Integer.class, ID);
        return n == null ? 0 : n;
    }

    /** 存在の確認をすり抜けた同時の作成（確認の後に別の要求が同じ ID を入れた）は、主キー違反を 409 にする。 */
    @Test
    void primaryKeyViolationBecomesConflict() {
        service.create(userId, request(payload(100), 1));
        doReturn(false).when(repository).existsById(ID);

        CreateCustomWeaponRequest duplicate = request(payload(200), 1);

        assertThatThrownBy(() -> service.create(userId, duplicate))
                .isInstanceOf(ResourceConflictException.class)
                .hasMessage(WeaponService.ID_EXISTS);
        assertThat(jdbc.queryForObject("SELECT payload->>'attack' FROM weapons WHERE id = ?", String.class, ID))
                .isEqualTo("100");
    }

    @Test
    void foreignKeyViolationIsNotConflict() {
        UUID unknownUser = UUID.fromString("01900000-0002-7000-8000-000000000012");

        CreateCustomWeaponRequest request = request(payload(100), 1);

        assertThatThrownBy(() -> service.create(unknownUser, request))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(rows()).isZero();
    }

    /** ck_weapons_schema_version（schema_version >= 1）。 */
    @Test
    void schemaVersionCheckViolationIsNotConflict() {
        CreateCustomWeaponRequest request = request(payload(100), 0);

        assertThatThrownBy(() -> service.create(userId, request)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(rows()).isZero();
    }

    /** payload の欠落は DB まで届き、ID の衝突に化けない（ck_weapons_payload の手前の NOT NULL で拒否される）。 */
    @Test
    void missingPayloadIsNotConflict() {
        CreateCustomWeaponRequest request = request(null, 1);

        assertThatThrownBy(() -> service.create(userId, request)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(rows()).isZero();
    }
}

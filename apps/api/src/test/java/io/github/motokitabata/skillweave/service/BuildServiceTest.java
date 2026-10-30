package io.github.motokitabata.skillweave.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.dto.request.CreateBuildRequest;
import io.github.motokitabata.skillweave.entity.BuildPayload;
import io.github.motokitabata.skillweave.repository.BuildRepository;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.ObjectMapper;

/** 構成の作成で、主キー違反だけが 409 になり、ほかの DB の拒否は ID の衝突に化けないこと。 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
class BuildServiceTest {

    private static final UUID ID = UUID.fromString("01900000-0001-7000-8000-000000000001");
    private static final String PAYLOAD = "{\"weapon\":{\"kind\":\"master\",\"weaponId\":\"wp:charge-blade:22\"},"
            + "\"armor\":{\"head\":null,\"chest\":null,\"arms\":null,\"waist\":null,\"legs\":null},\"charm\":null,"
            + "\"decorations\":[],\"skills\":[],\"freeSlots\":[],\"activeConditionIds\":[]}";

    @Autowired
    private BuildService service;

    @MockitoSpyBean
    private BuildRepository repository;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ObjectMapper mapper;

    private UUID userId;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM builds");
        userId = jdbc.queryForObject(
                "INSERT INTO users (discord_id) VALUES ('400000000000000001')"
                        + " ON CONFLICT (discord_id) DO UPDATE SET discord_id = EXCLUDED.discord_id RETURNING id",
                UUID.class);
    }

    private CreateBuildRequest request(String name) {
        return new CreateBuildRequest(ID, name, "1.0.0", mapper.readValue(PAYLOAD, BuildPayload.class), 1);
    }

    private int rows() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM builds WHERE id = ?", Integer.class, ID);
        return n == null ? 0 : n;
    }

    /** 存在の確認をすり抜けた同時の作成（確認の後に別の要求が同じ ID を入れた）は、主キー違反を 409 にする。 */
    @Test
    void primaryKeyViolationBecomesConflict() {
        service.create(userId, request("先"));
        doReturn(false).when(repository).existsById(ID);

        CreateBuildRequest second = request("後");

        assertThatThrownBy(() -> service.create(userId, second))
                .isInstanceOf(ResourceConflictException.class)
                .hasMessage(BuildService.ID_EXISTS);
        assertThat(jdbc.queryForObject("SELECT name FROM builds WHERE id = ?", String.class, ID))
                .isEqualTo("先");
    }

    @Test
    void foreignKeyViolationIsNotConflict() {
        UUID unknownUser = UUID.fromString("01900000-0002-7000-8000-000000000002");

        CreateBuildRequest request = request("構成");

        assertThatThrownBy(() -> service.create(unknownUser, request))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(rows()).isZero();
    }

    /** CHECK 制約（ck_builds_name の 51 文字）と文字コード（U+0000。SQLState 22021）の拒否。 */
    @ParameterizedTest
    @ValueSource(strings = {"123456789012345678901234567890123456789012345678901", "名\u0000前"})
    void rejectionOtherThanPrimaryKeyIsNotConflict(String name) {
        CreateBuildRequest request = request(name);

        assertThatThrownBy(() -> service.create(userId, request)).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(rows()).isZero();
    }
}

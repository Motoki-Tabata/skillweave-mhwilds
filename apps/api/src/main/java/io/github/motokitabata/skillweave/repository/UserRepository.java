package io.github.motokitabata.skillweave.repository;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code users} の読み書き。採番は DB の {@code DEFAULT uuidv7()}（サーバー採番の例外。data-model-standard.md）。
 */
@Repository
public class UserRepository {

    // 競合時の更新は自分自身の値を書き戻すだけにし、2回目以降は行の値を変えない（updated_at も動かさない）。
    private static final String UPSERT = """
            INSERT INTO users (discord_id) VALUES (:discordId)
            ON CONFLICT (discord_id) DO UPDATE SET discord_id = users.discord_id
            RETURNING id
            """;

    private final JdbcClient jdbcClient;

    public UserRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    /** Discord ID に対応するユーザーの内部 ID を返す。無ければ作る（同時に来ても重複も失敗もしない）。 */
    public UUID findOrCreateByDiscordId(String discordId) {
        return jdbcClient
                .sql(UPSERT)
                .param("discordId", discordId)
                .query(UUID.class)
                .single();
    }
}

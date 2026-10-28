package io.github.motokitabata.skillweave.repository;

import io.github.motokitabata.skillweave.entity.Build;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BuildRepository extends JpaRepository<Build, UUID> {

    List<Build> findByUserIdAndDeletedAtIsNullOrderByIdDesc(UUID userId);

    Optional<Build> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    /**
     * 行バージョンは照合せず、削除していない自分の行だけに deleted_at を入れる。
     * 行バージョンは加算する（同時の名前の変更が古いスナップショットで削除を上書きして生き返らせるのを、楽観ロックで弾くため）。
     */
    @Modifying
    @Query("UPDATE Build b SET b.deletedAt = :now, b.updatedAt = :now, b.version = b.version + 1"
            + " WHERE b.id = :id AND b.userId = :userId AND b.deletedAt IS NULL")
    int markDeleted(@Param("id") UUID id, @Param("userId") UUID userId, @Param("now") Instant now);
}

package io.github.motokitabata.skillweave.repository;

import io.github.motokitabata.skillweave.entity.Share;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ShareRepository extends JpaRepository<Share, UUID> {

    List<Share> findByUserIdAndDeletedAtIsNullOrderByIdDesc(UUID userId);

    Optional<Share> findByBuildIdAndDeletedAtIsNull(UUID buildId);

    Optional<Share> findByShortIdAndDeletedAtIsNull(String shortId);

    /** 取り消していない自分の行だけに deleted_at を入れる。行が無い・他のユーザー・取り消し済みなら 0 件。 */
    @Modifying
    @Query("UPDATE Share s SET s.deletedAt = :now, s.updatedAt = :now"
            + " WHERE s.id = :id AND s.userId = :userId AND s.deletedAt IS NULL")
    int markRevoked(@Param("id") UUID id, @Param("userId") UUID userId, @Param("now") Instant now);
}

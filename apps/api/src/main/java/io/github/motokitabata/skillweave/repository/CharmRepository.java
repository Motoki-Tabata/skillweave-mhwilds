package io.github.motokitabata.skillweave.repository;

import io.github.motokitabata.skillweave.entity.Charm;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CharmRepository extends JpaRepository<Charm, UUID> {

    List<Charm> findByUserIdAndDeletedAtIsNullOrderByIdDesc(UUID userId);

    Optional<Charm> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    /** 行バージョンを照合・加算せず、削除していない自分の行だけに deleted_at を入れる。 */
    @Modifying
    @Query("UPDATE Charm c SET c.deletedAt = :now, c.updatedAt = :now"
            + " WHERE c.id = :id AND c.userId = :userId AND c.deletedAt IS NULL")
    int markDeleted(@Param("id") UUID id, @Param("userId") UUID userId, @Param("now") Instant now);
}

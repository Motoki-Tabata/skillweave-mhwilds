package io.github.motokitabata.skillweave.repository;

import io.github.motokitabata.skillweave.entity.CustomWeapon;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CustomWeaponRepository extends JpaRepository<CustomWeapon, UUID> {

    List<CustomWeapon> findByUserIdAndDeletedAtIsNullOrderByIdDesc(UUID userId);

    Optional<CustomWeapon> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    /**
     * 行バージョンは照合せず、削除していない自分の行だけに deleted_at を入れる。
     * 行バージョンは加算する（同時の更新が古いスナップショットで削除を上書きして生き返らせるのを、楽観ロックで弾くため）。
     */
    @Modifying
    @Query("UPDATE CustomWeapon c SET c.deletedAt = :now, c.updatedAt = :now, c.version = c.version + 1"
            + " WHERE c.id = :id AND c.userId = :userId AND c.deletedAt IS NULL")
    int markDeleted(@Param("id") UUID id, @Param("userId") UUID userId, @Param("now") Instant now);
}

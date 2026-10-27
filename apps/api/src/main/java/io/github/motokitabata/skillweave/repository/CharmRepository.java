package io.github.motokitabata.skillweave.repository;

import io.github.motokitabata.skillweave.entity.Charm;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CharmRepository extends JpaRepository<Charm, UUID> {

    List<Charm> findByUserIdAndDeletedAtIsNullOrderByIdDesc(UUID userId);

    Optional<Charm> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);
}

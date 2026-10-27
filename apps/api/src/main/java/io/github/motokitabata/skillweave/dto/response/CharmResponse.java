package io.github.motokitabata.skillweave.dto.response;

import io.github.motokitabata.skillweave.entity.Charm;
import io.github.motokitabata.skillweave.entity.CharmPayload;
import java.time.Instant;
import java.util.UUID;

/** 保存した護石（契約の Charm）。 */
public record CharmResponse(
        UUID id, CharmPayload payload, int schemaVersion, int version, Instant createdAt, Instant updatedAt) {

    public static CharmResponse from(Charm charm) {
        return new CharmResponse(
                charm.getId(),
                charm.getPayload(),
                charm.getSchemaVersion(),
                charm.getVersion(),
                charm.getCreatedAt(),
                charm.getUpdatedAt());
    }
}

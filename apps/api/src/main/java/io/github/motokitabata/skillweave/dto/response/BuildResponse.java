package io.github.motokitabata.skillweave.dto.response;

import io.github.motokitabata.skillweave.entity.Build;
import io.github.motokitabata.skillweave.entity.BuildPayload;
import java.time.Instant;
import java.util.UUID;

/** 保存した構成（契約の Build）。 */
public record BuildResponse(
        UUID id,
        String name,
        String masterVersion,
        BuildPayload payload,
        int schemaVersion,
        int version,
        Instant createdAt,
        Instant updatedAt) {

    public static BuildResponse from(Build build) {
        return new BuildResponse(
                build.getId(),
                build.getName(),
                build.getMasterVersion(),
                build.getPayload(),
                build.getSchemaVersion(),
                build.getVersion(),
                build.getCreatedAt(),
                build.getUpdatedAt());
    }
}

package io.github.motokitabata.skillweave.dto.response;

import io.github.motokitabata.skillweave.entity.Share;
import java.time.Instant;
import java.util.UUID;

/** 自分の共有（契約の Share）。 */
public record ShareResponse(UUID id, String shortId, UUID buildId, String name, Instant createdAt) {

    public static ShareResponse from(Share share) {
        return new ShareResponse(
                share.getId(), share.getShortId(), share.getBuildId(), share.getName(), share.getCreatedAt());
    }
}

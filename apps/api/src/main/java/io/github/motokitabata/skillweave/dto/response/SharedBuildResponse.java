package io.github.motokitabata.skillweave.dto.response;

import io.github.motokitabata.skillweave.entity.BuildPayload;
import io.github.motokitabata.skillweave.entity.Share;
import java.time.Instant;

/** 共有された構成（契約の SharedBuild）。共有の行の ID・元の構成の ID・作成者の情報は持たない。 */
public record SharedBuildResponse(
        String name, String masterVersion, BuildPayload payload, int schemaVersion, Instant createdAt) {

    public static SharedBuildResponse from(Share share) {
        return new SharedBuildResponse(
                share.getName(),
                share.getMasterVersion(),
                share.getPayload(),
                share.getSchemaVersion(),
                share.getCreatedAt());
    }
}

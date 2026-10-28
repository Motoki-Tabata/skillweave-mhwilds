package io.github.motokitabata.skillweave.dto.request;

import io.github.motokitabata.skillweave.entity.BuildPayload;
import io.github.motokitabata.skillweave.validator.BuildName;
import io.github.motokitabata.skillweave.validator.UuidV7;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** 構成の作成の要求（契約の CreateBuildRequest）。行バージョン・日時はサーバーが決めるので持たない。 */
public record CreateBuildRequest(
        @NotNull @UuidV7 UUID id,
        @NotNull @BuildName String name,

        @NotNull @Size(max = 32) @Pattern(regexp = "\\d+\\.\\d+\\.\\d+")
        String masterVersion,

        @NotNull @Valid BuildPayload payload,
        @NotNull @Min(1) @Max(1) Integer schemaVersion) {}

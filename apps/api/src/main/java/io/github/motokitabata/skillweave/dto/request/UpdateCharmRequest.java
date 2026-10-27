package io.github.motokitabata.skillweave.dto.request;

import io.github.motokitabata.skillweave.entity.CharmPayload;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 護石の更新の要求（契約の UpdateCharmRequest）。{@code version} は読んだ時点の行バージョン。 */
public record UpdateCharmRequest(
        @NotNull @Valid CharmPayload payload,
        @NotNull @Min(1) @Max(1) Integer schemaVersion,
        @NotNull @Min(0) Integer version) {}

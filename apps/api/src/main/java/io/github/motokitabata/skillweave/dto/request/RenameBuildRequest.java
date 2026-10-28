package io.github.motokitabata.skillweave.dto.request;

import io.github.motokitabata.skillweave.validator.BuildName;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 構成の名前の変更の要求（契約の RenameBuildRequest）。{@code version} は読んだ時点の行バージョン。 */
public record RenameBuildRequest(
        @NotNull @BuildName String name, @NotNull @Min(0) Integer version) {}

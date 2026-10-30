package io.github.motokitabata.skillweave.dto.request;

import io.github.motokitabata.skillweave.entity.CustomWeaponPayload;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** 個体差のある武器の更新の要求（契約の UpdateCustomWeaponRequest）。{@code version} は読んだ時点の行バージョン。 */
public record UpdateCustomWeaponRequest(
        @NotNull @Valid CustomWeaponPayload payload,
        @NotNull @Min(1) @Max(1) Integer schemaVersion,
        @NotNull @Min(0) Integer version) {}

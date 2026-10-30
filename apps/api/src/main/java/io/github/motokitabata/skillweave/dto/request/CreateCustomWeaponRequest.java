package io.github.motokitabata.skillweave.dto.request;

import io.github.motokitabata.skillweave.entity.CustomWeaponPayload;
import io.github.motokitabata.skillweave.validator.UuidV7;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 個体差のある武器の作成の要求（契約の CreateCustomWeaponRequest）。版・日時はサーバーが決めるので持たない。 */
public record CreateCustomWeaponRequest(
        @NotNull @UuidV7 UUID id,
        @NotNull @Valid CustomWeaponPayload payload,
        @NotNull @Min(1) @Max(1) Integer schemaVersion) {}

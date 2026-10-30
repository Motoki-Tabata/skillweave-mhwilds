package io.github.motokitabata.skillweave.dto.response;

import io.github.motokitabata.skillweave.entity.CustomWeapon;
import io.github.motokitabata.skillweave.entity.CustomWeaponPayload;
import java.time.Instant;
import java.util.UUID;

/** 保存した個体差のある武器（契約の CustomWeapon）。 */
public record CustomWeaponResponse(
        UUID id, CustomWeaponPayload payload, int schemaVersion, int version, Instant createdAt, Instant updatedAt) {

    public static CustomWeaponResponse from(CustomWeapon charm) {
        return new CustomWeaponResponse(
                charm.getId(),
                charm.getPayload(),
                charm.getSchemaVersion(),
                charm.getVersion(),
                charm.getCreatedAt(),
                charm.getUpdatedAt());
    }
}

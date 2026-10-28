package io.github.motokitabata.skillweave.entity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** ユーザーが作った武器の参照と写し（契約の BuildCustomWeapon）。ID は参照なので UUID の形だけを検査する。 */
public record BuildCustomWeapon(
        @NotNull UUID id, @NotNull @Valid CustomWeaponPayload payload) implements BuildWeapon {}

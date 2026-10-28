package io.github.motokitabata.skillweave.entity;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** マスターの武器の参照（契約の BuildMasterWeapon）。マスターに存在するかは検査しない。 */
public record BuildMasterWeapon(
        @NotNull @Pattern(regexp = BuildMasterWeapon.WEAPON_ID)
        String weaponId) implements BuildWeapon {

    public static final String WEAPON_ID = "wp:[a-z]+(-[a-z]+)*:\\d+";
}

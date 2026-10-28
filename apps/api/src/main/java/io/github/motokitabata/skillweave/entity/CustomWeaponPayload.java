package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** ユーザーが作った武器の内容の写し（契約の CustomWeaponPayload。Web の WeaponPayload と同じ形）。 */
public record CustomWeaponPayload(
        @NotNull @Pattern(regexp = BuildMasterWeapon.WEAPON_ID)
        String baseWeaponId,

        @NotNull String name,
        @NotNull @Min(1) @Max(999) Integer attack,
        @NotNull @Min(-100) @Max(100) Integer affinity,
        @Valid @JsonInclude(JsonInclude.Include.NON_NULL) Element element,
        @NotNull @Size(max = 3) List<@NotNull @Valid Slot> slots,
        @Pattern(regexp = CustomWeaponPayload.BONUS_ID) String seriesBonusId,
        @Pattern(regexp = CustomWeaponPayload.BONUS_ID) String groupBonusId) {

    static final String BONUS_ID = "sb:-?\\d+";
    private static final int NAME_MAX = 30;

    /** 属性。属性を持たない武器は省略する。 */
    public record Element(
            @NotNull @Pattern(regexp = "fire|water|thunder|ice|dragon|poison|paralysis|sleep|blastblight")
            String type,

            @NotNull @Min(1) @Max(99) Integer value) {}

    /** 武器のスロット1枠。 */
    public record Slot(
            @NotNull @Pattern(regexp = "weapon") String target,
            @NotNull @Min(1) @Max(3) Integer level) {}

    /** 名前は 0〜30 コードポイント（Web は {@code [...name].length} で数える）。 */
    @JsonIgnore
    @AssertTrue
    public boolean isNameWithinLimit() {
        return name == null || name.codePointCount(0, name.length()) <= NAME_MAX;
    }
}

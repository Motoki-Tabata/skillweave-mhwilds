package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** 発動しているスキルとそのレベル（契約の BuildSkill）。 */
public record BuildSkill(
        @NotNull @Pattern(regexp = "sk:-?\\d+") String skillId,
        @NotNull @Min(1) Integer level,
        @NotNull @Min(1) Integer rawLevel) {

    /** 頭打ち前の合計レベルは、頭打ち後のレベル以上。 */
    @JsonIgnore
    @AssertTrue
    public boolean isRawLevelAtLeastLevel() {
        return level == null || rawLevel == null || rawLevel >= level;
    }
}

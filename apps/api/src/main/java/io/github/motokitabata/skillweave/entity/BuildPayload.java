package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;

/**
 * 構成の内容（契約の BuildPayload）。要求の構造の検査と {@code builds.payload}（jsonb）の形を兼ねる。
 * {@code charm} は null 可（護石を使わない構成）。
 */
public record BuildPayload(
        @NotNull @Valid BuildWeapon weapon,
        @NotNull @Valid BuildArmor armor,
        @JsonProperty(required = true) @Valid BuildCharm charm,
        @NotNull @Size(max = 21) List<@NotNull @Valid BuildDecoration> decorations,
        @NotNull @Size(max = 100) List<@NotNull @Valid BuildSkill> skills,
        @NotNull @Size(max = 21) List<@NotNull @Valid BuildSlotRef> freeSlots,
        @NotNull @Size(max = 50) List<@NotNull @Pattern(regexp = "cd:[a-z][a-z0-9_]*") String> activeConditionIds) {

    /** 同じスキル ID を重複して持たない。 */
    @JsonIgnore
    @AssertTrue
    public boolean isSkillIdsUnique() {
        if (skills == null) {
            return true;
        }
        return skills.stream().filter(Objects::nonNull).map(BuildSkill::skillId).allMatch(new HashSet<>()::add);
    }

    /** 発動条件の ID に重複がない。 */
    @JsonIgnore
    @AssertTrue
    public boolean isActiveConditionIdsUnique() {
        if (activeConditionIds == null) {
            return true;
        }
        return activeConditionIds.stream().filter(Objects::nonNull).allMatch(new HashSet<>()::add);
    }
}

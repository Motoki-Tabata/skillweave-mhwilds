package io.github.motokitabata.skillweave.entity;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** 護石が持つスキルとそのレベル（契約の CharmSkill。jsonb にもこの形で書く）。 */
public record CharmSkill(
        @NotNull @Pattern(regexp = "sk:\\d+") String skillId,
        @NotNull @Min(1) Integer level) {}

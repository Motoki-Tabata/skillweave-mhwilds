package io.github.motokitabata.skillweave.entity;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** 護石が持つ装飾品スロット1枠（契約の CharmSlot。jsonb にもこの形で書く）。 */
public record CharmSlot(
        @NotNull @Pattern(regexp = "weapon|armor") String target,
        @NotNull @Min(1) @Max(3) Integer level) {}

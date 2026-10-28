package io.github.motokitabata.skillweave.entity;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** スロット1枠の位置（契約の BuildSlotRef）。 */
public record BuildSlotRef(
        @NotNull @Pattern(regexp = "weapon|head|chest|arms|waist|legs|charm")
        String owner,

        @NotNull @Min(0) @Max(2) Integer index) {}

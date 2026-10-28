package io.github.motokitabata.skillweave.entity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** 装飾品1個の配置（契約の BuildDecoration）。 */
public record BuildDecoration(
        @NotNull @Valid BuildSlotRef slot,
        @NotNull @Pattern(regexp = "dc:-?\\d+") String decorationId) {}

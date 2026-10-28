package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Pattern;

/** 部位ごとの防具 ID（契約の BuildArmor）。着けない部位は null。部位のキーと ID の部位の一致は検査しない。 */
public record BuildArmor(
        @JsonProperty(required = true) @Pattern(regexp = BuildArmor.ARMOR_ID)
        String head,

        @JsonProperty(required = true) @Pattern(regexp = BuildArmor.ARMOR_ID)
        String chest,

        @JsonProperty(required = true) @Pattern(regexp = BuildArmor.ARMOR_ID)
        String arms,

        @JsonProperty(required = true) @Pattern(regexp = BuildArmor.ARMOR_ID)
        String waist,

        @JsonProperty(required = true) @Pattern(regexp = BuildArmor.ARMOR_ID)
        String legs) {

    static final String ARMOR_ID = "ar:-?\\d+:(head|chest|arms|waist|legs)";
}

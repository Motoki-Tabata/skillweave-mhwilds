package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;

/**
 * 生産護石の参照（契約の BuildCraftedCharm）。マスターに存在するかは検査しない。
 * {@code unknown} は未知の項目の受け皿で、空でなければ検査で落とす（鑑定護石の形の項目を併せ持つ値を、oneOf の不正として 400 にするため）。
 */
public record BuildCraftedCharm(
        @NotNull @Pattern(regexp = "crafted") String kind,

        @NotNull @Pattern(regexp = BuildCraftedCharm.CHARM_ID)
        String charmId,

        @JsonIgnore @JsonAnySetter @Size(max = 0) Map<String, Object> unknown)
        implements BuildPayloadCharm {

    public static final String CHARM_ID = "ch:-?\\d+:\\d+";
}

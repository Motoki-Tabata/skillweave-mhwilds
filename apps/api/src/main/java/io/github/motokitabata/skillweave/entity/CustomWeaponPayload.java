package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.annotation.JsonDeserialize;

/** ユーザーが作った武器の内容の写し（契約の CustomWeaponPayload。Web の WeaponPayload と同じ形）。 */
public record CustomWeaponPayload(
        @NotNull @Pattern(regexp = BuildMasterWeapon.WEAPON_ID)
        String baseWeaponId,

        @NotNull String name,
        @NotNull @Min(1) @Max(999) Integer attack,
        @NotNull @Min(-100) @Max(100) Integer affinity,

        @Valid
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @JsonDeserialize(using = CustomWeaponPayload.ElementDeserializer.class)
        Element element,

        @NotNull @Size(max = 3) List<@NotNull @Valid Slot> slots,

        @JsonProperty(required = true) @Pattern(regexp = CustomWeaponPayload.BONUS_ID)
        String seriesBonusId,

        @JsonProperty(required = true) @Pattern(regexp = CustomWeaponPayload.BONUS_ID)
        String groupBonusId) {

    static final String BONUS_ID = "sb:-?\\d+";
    private static final int NAME_MAX = 30;

    /**
     * element の読み取り。省略は受け付け（null になる）、明示の null は拒否する（013 AC-11）。
     * 組み込みの Nulls.FAIL は省略（creator の欠落）まで拒否するので使えない。
     */
    static final class ElementDeserializer extends ValueDeserializer<Element> {
        @Override
        public Element deserialize(JsonParser p, DeserializationContext ctxt) {
            return ctxt.readTreeAsValue(ctxt.readTree(p), Element.class);
        }

        @Override
        public Element getNullValue(DeserializationContext ctxt) {
            return (Element) ctxt.reportInputMismatch(Element.class, "element must be omitted, not null");
        }

        @Override
        public Object getAbsentValue(DeserializationContext ctxt) {
            return null;
        }
    }

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

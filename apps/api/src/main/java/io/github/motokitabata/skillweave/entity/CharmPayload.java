package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Objects;

/**
 * 護石の内容（契約の CharmPayload）。要求の構造の検査と {@code charms.payload}（jsonb）の形を兼ねる。
 * 未知のプロパティは record に無いので保存しない。
 */
public record CharmPayload(
        @NotNull @Min(5) @Max(8) Integer rarity,
        @NotNull @Size(max = 3) List<@NotNull @Valid CharmSkill> skills,
        @NotNull @Size(max = 3) List<@NotNull @Valid CharmSlot> slots) {

    /** 同じスキル ID を重複して持たない。 */
    @JsonIgnore
    @AssertTrue
    public boolean isSkillIdsUnique() {
        if (skills == null) {
            return true;
        }
        return skills.stream()
                        .filter(Objects::nonNull)
                        .map(CharmSkill::skillId)
                        .distinct()
                        .count()
                == skills.stream().filter(Objects::nonNull).count();
    }
}

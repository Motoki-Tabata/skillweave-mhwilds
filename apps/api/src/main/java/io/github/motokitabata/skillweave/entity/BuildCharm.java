package io.github.motokitabata.skillweave.entity;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;

/**
 * 鑑定護石の参照と写し（契約の BuildCharm）。ID は参照なので UUID の形だけを検査する。
 * {@code unknown} は未知の項目の受け皿で、空でなければ検査で落とす（生産護石の形の項目を併せ持つ値を、oneOf の不正として 400 にするため）。
 */
public record BuildCharm(
        @NotNull UUID id,
        @NotNull @Valid CharmPayload payload,
        @JsonIgnore @JsonAnySetter @Size(max = 0) Map<String, Object> unknown)
        implements BuildPayloadCharm {}

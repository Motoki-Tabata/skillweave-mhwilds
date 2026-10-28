package io.github.motokitabata.skillweave.entity;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 護石の参照と写し（契約の BuildCharm）。ID は参照なので UUID の形だけを検査する。 */
public record BuildCharm(@NotNull UUID id, @NotNull @Valid CharmPayload payload) {}

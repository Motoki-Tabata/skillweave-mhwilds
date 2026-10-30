package io.github.motokitabata.skillweave.dto.request;

import io.github.motokitabata.skillweave.validator.UuidV7;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** 共有の作成の要求（契約の CreateShareRequest）。構成の内容はサーバーが構成の行から写すので持たない。 */
public record CreateShareRequest(
        @NotNull @UuidV7 UUID id, @NotNull UUID buildId) {}

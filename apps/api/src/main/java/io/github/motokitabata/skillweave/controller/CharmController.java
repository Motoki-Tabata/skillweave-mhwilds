package io.github.motokitabata.skillweave.controller;

import io.github.motokitabata.skillweave.common.exception.CharmNotFoundException;
import io.github.motokitabata.skillweave.dto.request.CreateCharmRequest;
import io.github.motokitabata.skillweave.dto.request.UpdateCharmRequest;
import io.github.motokitabata.skillweave.dto.response.CharmResponse;
import io.github.motokitabata.skillweave.security.DiscordUserPrincipal;
import io.github.motokitabata.skillweave.service.CharmService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 護石の API（010 charm-save）。未ログインの 401 は認証の入口が返す。 */
@RestController
@RequestMapping("/api/charms")
public class CharmController {

    private final CharmService service;

    public CharmController(CharmService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "listCharms")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "401")
    public List<CharmResponse> list(@AuthenticationPrincipal DiscordUserPrincipal principal) {
        return service.list(principal.userId());
    }

    @PostMapping
    @Operation(operationId = "createCharm")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "401")
    @ApiResponse(responseCode = "409")
    @ResponseStatus(HttpStatus.CREATED)
    public CharmResponse create(
            @AuthenticationPrincipal DiscordUserPrincipal principal, @Valid @RequestBody CreateCharmRequest request) {
        return service.create(principal.userId(), request);
    }

    // {id} が UUID の形でないときは、行が無いのと同じに扱う（PUT は 404・DELETE は 204）。
    @PutMapping("/{id}")
    @Operation(operationId = "updateCharm")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "401")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    public CharmResponse update(
            @AuthenticationPrincipal DiscordUserPrincipal principal,
            @PathVariable String id,
            @Valid @RequestBody UpdateCharmRequest request) {
        UUID charmId = parseId(id).orElseThrow(CharmNotFoundException::new);
        return service.update(principal.userId(), charmId, request);
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteCharm")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "401")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal DiscordUserPrincipal principal, @PathVariable String id) {
        parseId(id).ifPresent(charmId -> service.delete(principal.userId(), charmId));
    }

    private static Optional<UUID> parseId(String id) {
        try {
            return Optional.of(UUID.fromString(id));
        } catch (IllegalArgumentException _) {
            return Optional.empty();
        }
    }
}

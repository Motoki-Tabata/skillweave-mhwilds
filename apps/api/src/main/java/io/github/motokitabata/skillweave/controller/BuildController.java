package io.github.motokitabata.skillweave.controller;

import io.github.motokitabata.skillweave.common.exception.ResourceNotFoundException;
import io.github.motokitabata.skillweave.dto.request.CreateBuildRequest;
import io.github.motokitabata.skillweave.dto.request.RenameBuildRequest;
import io.github.motokitabata.skillweave.dto.response.BuildResponse;
import io.github.motokitabata.skillweave.security.DiscordUserPrincipal;
import io.github.motokitabata.skillweave.service.BuildService;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 保存した構成の API（011 build-save）。未ログインの 401 は認証の入口が返す。 */
@RestController
@RequestMapping("/api/builds")
public class BuildController {

    private final BuildService service;

    public BuildController(BuildService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "listBuilds")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "401")
    public List<BuildResponse> list(@AuthenticationPrincipal DiscordUserPrincipal principal) {
        return service.list(principal.userId());
    }

    @PostMapping
    @Operation(operationId = "createBuild")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "401")
    @ApiResponse(responseCode = "409")
    @ResponseStatus(HttpStatus.CREATED)
    public BuildResponse create(
            @AuthenticationPrincipal DiscordUserPrincipal principal, @Valid @RequestBody CreateBuildRequest request) {
        return service.create(principal.userId(), request);
    }

    // {id} が UUID の形でないときは、行が無いのと同じに扱う（PATCH は 404・DELETE は 204）。
    @PatchMapping("/{id}")
    @Operation(operationId = "renameBuild")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "401")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    public BuildResponse rename(
            @AuthenticationPrincipal DiscordUserPrincipal principal,
            @PathVariable String id,
            @Valid @RequestBody RenameBuildRequest request) {
        UUID buildId = parseId(id).orElseThrow(() -> new ResourceNotFoundException(BuildService.NOT_FOUND));
        return service.rename(principal.userId(), buildId, request);
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteBuild")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "401")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal DiscordUserPrincipal principal, @PathVariable String id) {
        parseId(id).ifPresent(buildId -> service.delete(principal.userId(), buildId));
    }

    private static Optional<UUID> parseId(String id) {
        try {
            return Optional.of(UUID.fromString(id));
        } catch (IllegalArgumentException _) {
            return Optional.empty();
        }
    }
}

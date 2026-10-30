package io.github.motokitabata.skillweave.controller;

import io.github.motokitabata.skillweave.dto.request.CreateShareRequest;
import io.github.motokitabata.skillweave.dto.response.ShareResponse;
import io.github.motokitabata.skillweave.security.DiscordUserPrincipal;
import io.github.motokitabata.skillweave.service.ShareService;
import io.github.motokitabata.skillweave.service.ShareService.CreateResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 共有の管理の API（012 build-share）。未ログインの 401 は認証の入口が返す。 */
@RestController
@RequestMapping("/api/shares")
public class ShareController {

    private final ShareService service;

    public ShareController(ShareService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "listShares")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "401")
    public List<ShareResponse> list(@AuthenticationPrincipal DiscordUserPrincipal principal) {
        return service.list(principal.userId());
    }

    @PostMapping
    @Operation(operationId = "createShare")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "401")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    public ResponseEntity<ShareResponse> create(
            @AuthenticationPrincipal DiscordUserPrincipal principal, @Valid @RequestBody CreateShareRequest request) {
        CreateResult result = service.create(principal.userId(), request);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(result.share());
    }

    // {id} が UUID の形でないときは、行が無いのと同じに 204 にする。
    @DeleteMapping("/{id}")
    @Operation(operationId = "revokeShare")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "401")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@AuthenticationPrincipal DiscordUserPrincipal principal, @PathVariable String id) {
        parseId(id).ifPresent(shareId -> service.revoke(principal.userId(), shareId));
    }

    private static Optional<UUID> parseId(String id) {
        try {
            return Optional.of(UUID.fromString(id));
        } catch (IllegalArgumentException _) {
            return Optional.empty();
        }
    }
}

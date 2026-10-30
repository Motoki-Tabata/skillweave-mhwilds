package io.github.motokitabata.skillweave.controller;

import io.github.motokitabata.skillweave.common.exception.ResourceNotFoundException;
import io.github.motokitabata.skillweave.dto.response.SharedBuildResponse;
import io.github.motokitabata.skillweave.service.ShareService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 共有された構成の閲覧の API（012 build-share）。未ログインで GET・HEAD できる。主体は取らない。 */
@RestController
@RequestMapping("/api/shared-builds")
public class SharedBuildController {

    private static final Pattern SHORT_ID = Pattern.compile("[0-9A-Za-z]{12}");

    private final ShareService service;

    public SharedBuildController(ShareService service) {
        this.service = service;
    }

    // 形の違う短縮 ID は、取り消し済み・不在と区別せずに 404。
    @GetMapping("/{shortId}")
    @Operation(operationId = "getSharedBuild")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "404")
    public SharedBuildResponse get(@PathVariable String shortId) {
        if (!SHORT_ID.matcher(shortId).matches()) {
            throw new ResourceNotFoundException(ShareService.SHARE_NOT_FOUND);
        }
        return service.view(shortId);
    }
}

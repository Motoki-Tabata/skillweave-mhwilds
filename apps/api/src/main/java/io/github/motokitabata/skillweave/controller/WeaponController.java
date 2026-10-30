package io.github.motokitabata.skillweave.controller;

import io.github.motokitabata.skillweave.common.exception.ResourceNotFoundException;
import io.github.motokitabata.skillweave.dto.request.CreateCustomWeaponRequest;
import io.github.motokitabata.skillweave.dto.request.UpdateCustomWeaponRequest;
import io.github.motokitabata.skillweave.dto.response.CustomWeaponResponse;
import io.github.motokitabata.skillweave.security.DiscordUserPrincipal;
import io.github.motokitabata.skillweave.service.WeaponService;
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

/** 個体差のある武器の API（013 user-weapon-save）。未ログインの 401 は認証の入口が返す。 */
@RestController
@RequestMapping("/api/weapons")
public class WeaponController {

    private final WeaponService service;

    public WeaponController(WeaponService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "listWeapons")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "401")
    public List<CustomWeaponResponse> list(@AuthenticationPrincipal DiscordUserPrincipal principal) {
        return service.list(principal.userId());
    }

    @PostMapping
    @Operation(operationId = "createWeapon")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "401")
    @ApiResponse(responseCode = "409")
    @ResponseStatus(HttpStatus.CREATED)
    public CustomWeaponResponse create(
            @AuthenticationPrincipal DiscordUserPrincipal principal,
            @Valid @RequestBody CreateCustomWeaponRequest request) {
        return service.create(principal.userId(), request);
    }

    // {id} が UUID の形でないときは、行が無いのと同じに扱う（PUT は 404・DELETE は 204）。
    @PutMapping("/{id}")
    @Operation(operationId = "updateWeapon")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "401")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    public CustomWeaponResponse update(
            @AuthenticationPrincipal DiscordUserPrincipal principal,
            @PathVariable String id,
            @Valid @RequestBody UpdateCustomWeaponRequest request) {
        UUID weaponId = parseId(id).orElseThrow(() -> new ResourceNotFoundException(WeaponService.NOT_FOUND));
        return service.update(principal.userId(), weaponId, request);
    }

    @DeleteMapping("/{id}")
    @Operation(operationId = "deleteWeapon")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "401")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal DiscordUserPrincipal principal, @PathVariable String id) {
        parseId(id).ifPresent(weaponId -> service.delete(principal.userId(), weaponId));
    }

    private static Optional<UUID> parseId(String id) {
        try {
            return Optional.of(UUID.fromString(id));
        } catch (IllegalArgumentException _) {
            return Optional.empty();
        }
    }
}

package io.github.motokitabata.skillweave.controller;

import io.github.motokitabata.skillweave.dto.response.CurrentUser;
import io.github.motokitabata.skillweave.security.DiscordUserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 認証 API。未ログインの 401 は認証の入口（ProblemDetailAuthenticationEntryPoint）が返す。 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final LogoutHandler securityContextLogoutHandler = new SecurityContextLogoutHandler();
    private final LogoutHandler csrfLogoutHandler;

    public AuthController(LogoutHandler csrfLogoutHandler) {
        this.csrfLogoutHandler = csrfLogoutHandler;
    }

    @GetMapping("/me")
    @Operation(operationId = "getCurrentUser")
    @ApiResponse(responseCode = "200")
    @ApiResponse(responseCode = "401")
    public CurrentUser me(@AuthenticationPrincipal DiscordUserPrincipal principal) {
        return new CurrentUser(principal.displayName());
    }

    @PostMapping("/logout")
    @Operation(operationId = "logout")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "401")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        securityContextLogoutHandler.logout(request, response, authentication);
        csrfLogoutHandler.logout(request, response, authentication);
    }
}

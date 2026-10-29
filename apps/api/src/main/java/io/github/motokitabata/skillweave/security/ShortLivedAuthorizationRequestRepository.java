package io.github.motokitabata.skillweave.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.security.authentication.AuthenticationTrustResolver;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

/**
 * 未ログインの要求が認可を始めたとき、そのセッションの有効期間を短くする（認可を始めただけのセッションを長く残さない）。
 * ログイン済みのセッションの有効期間は短くしない。ログインに成功したら {@link WebTopRedirectHandler} が戻す。
 */
public class ShortLivedAuthorizationRequestRepository
        implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    private final HttpSessionOAuth2AuthorizationRequestRepository delegate =
            new HttpSessionOAuth2AuthorizationRequestRepository();
    private final AuthenticationTrustResolver trustResolver = new AuthenticationTrustResolverImpl();
    private final int timeoutSeconds;

    public ShortLivedAuthorizationRequestRepository(Duration timeout) {
        this.timeoutSeconds = Math.toIntExact(timeout.toSeconds());
    }

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        return delegate.loadAuthorizationRequest(request);
    }

    @Override
    public void saveAuthorizationRequest(
            OAuth2AuthorizationRequest authorizationRequest, HttpServletRequest request, HttpServletResponse response) {
        delegate.saveAuthorizationRequest(authorizationRequest, request, response);
        if (authorizationRequest != null && !isAuthenticated()) {
            request.getSession().setMaxInactiveInterval(timeoutSeconds);
        }
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(
            HttpServletRequest request, HttpServletResponse response) {
        return delegate.removeAuthorizationRequest(request, response);
    }

    private boolean isAuthenticated() {
        Authentication authentication =
                SecurityContextHolder.getContextHolderStrategy().getContext().getAuthentication();
        return trustResolver.isAuthenticated(authentication);
    }
}

package io.github.motokitabata.skillweave.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.DefaultRedirectStrategy;
import org.springframework.security.web.RedirectStrategy;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

/**
 * ログインの成功・失敗のどちらでも、設定済みの Web トップへ固定でリダイレクトする。
 * 戻り先を要求から受け取らず、保存した要求（SavedRequest）も使わない。
 * 失敗のときは、認可の途中で作ったセッションを無効にする。
 */
public class WebTopRedirectHandler implements AuthenticationSuccessHandler, AuthenticationFailureHandler {

    private final RedirectStrategy redirectStrategy = new DefaultRedirectStrategy();
    private final String webTopUrl;

    public WebTopRedirectHandler(String webTopUrl) {
        this.webTopUrl = webTopUrl;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {
        redirectStrategy.sendRedirect(request, response, webTopUrl);
    }

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        redirectStrategy.sendRedirect(request, response, webTopUrl);
    }
}

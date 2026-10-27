package io.github.motokitabata.skillweave.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.CookieSerializer.CookieValue;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 有効なセッションを持つ要求の応答でセッションの Cookie を書き直し、期限を最後の利用から数える。
 * Spring Session は、セッションの作成と ID の変更のときにしか Cookie を書かないため。
 */
public class SessionCookieRefreshFilter extends OncePerRequestFilter {

    private final CookieSerializer cookieSerializer;

    public SessionCookieRefreshFilter(CookieSerializer cookieSerializer) {
        this.cookieSerializer = cookieSerializer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // getSession(false) は、Cookie が無い・セッションが無効のときは null を返す。
        HttpSession session = request.getSession(false);
        if (session != null) {
            cookieSerializer.writeCookieValue(new CookieValue(request, response, session.getId()));
        }
        filterChain.doFilter(request, response);
    }
}

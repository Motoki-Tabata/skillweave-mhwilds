package io.github.motokitabata.skillweave.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import org.springframework.security.web.util.OnCommittedResponseWrapper;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.CookieSerializer.CookieValue;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 有効なセッションを持つ要求の応答でセッションの Cookie を書き直し、期限を最後の利用から数える。
 * Spring Session は、セッションの作成と ID の変更のときにしか Cookie を書かないため。
 *
 * <p>書き直しは応答の確定直前に行う。要求の Cookie のセッション ID がそのまま有効なときだけ書く。
 * ID が変わった（ログイン成功）・無効になった（ログアウト、ログイン失敗）・新しく作られたときは、
 * Spring Session がすでに書いているので書かない。同名の Set-Cookie を 1 つの応答に複数出さないため。
 */
public class SessionCookieRefreshFilter extends OncePerRequestFilter {

    private final CookieSerializer cookieSerializer;

    public SessionCookieRefreshFilter(CookieSerializer cookieSerializer) {
        this.cookieSerializer = cookieSerializer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        RefreshOnCommitResponse wrapped = new RefreshOnCommitResponse(request, response);
        filterChain.doFilter(request, wrapped);
        // 本文が小さく、処理の中で一度も確定されなかった応答でも書き直す（例外で抜けた応答は触らない）。
        if (!wrapped.isCommitted() && !request.isAsyncStarted()) {
            wrapped.flushBuffer();
        }
    }

    private final class RefreshOnCommitResponse extends OnCommittedResponseWrapper {

        private final HttpServletRequest request;

        RefreshOnCommitResponse(HttpServletRequest request, HttpServletResponse response) {
            super(response);
            this.request = request;
        }

        @Override
        protected void onResponseCommitted() {
            // getSession(false) は、Cookie が無い・セッションが無効のときは null を返す。
            HttpSession session = request.getSession(false);
            if (session != null && cookieSerializer.readCookieValues(request).contains(session.getId())) {
                cookieSerializer.writeCookieValue(new CookieValue(request, this, session.getId()));
            }
        }
    }
}

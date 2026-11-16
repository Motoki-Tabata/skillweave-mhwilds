package io.github.motokitabata.skillweave.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.stereotype.Component;

/**
 * 起動のたびに期限切れのセッションを 1 回掃除する（040 session-cleanup）。
 * 最小インスタンス 0 の本番では、毎日 3:00 の cron の時刻にインスタンスが動いている保証が無いため。
 * すべての singleton（Flyway を含む）の生成の後、Web サーバーがポートを開く前に走る。
 * 失敗しても起動は止めない（DB に届かない training プロファイルを含む）。
 */
@Component
public class SessionStartupCleanup implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(SessionStartupCleanup.class);

    private final JdbcIndexedSessionRepository sessionRepository;

    public SessionStartupCleanup(JdbcIndexedSessionRepository sessionRepository) {
        this.sessionRepository = sessionRepository;
    }

    @Override
    public void afterSingletonsInstantiated() {
        try {
            sessionRepository.cleanUpExpiredSessions();
        } catch (RuntimeException e) {
            log.warn("Failed to clean up expired sessions on startup", e);
        }
    }
}

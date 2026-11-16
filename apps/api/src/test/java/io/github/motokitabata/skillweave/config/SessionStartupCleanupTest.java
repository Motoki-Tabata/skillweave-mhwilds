package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.transaction.CannotCreateTransactionException;

/** 起動時のセッション掃除（040 session-cleanup の AC-3, AC-4）。Spring は起動しない。 */
@ExtendWith(OutputCaptureExtension.class)
class SessionStartupCleanupTest {

    private final JdbcIndexedSessionRepository repository = mock(JdbcIndexedSessionRepository.class);

    private final SessionStartupCleanup cleanup = new SessionStartupCleanup(repository);

    static RuntimeException[] failures() {
        SQLException cause = new SQLException("boom");
        return new RuntimeException[] {
            new CannotCreateTransactionException("no transaction"),
            new CannotGetJdbcConnectionException("no connection", cause),
            new BadSqlGrammarException("task", "SELECT", cause)
        };
    }

    // AC-3: 削除は Spring Session の cleanUpExpiredSessions() の 1 回だけで行い、ほかの呼び出しをしない。
    @Test
    void callsCleanUpExpiredSessionsExactlyOnce() {
        cleanup.afterSingletonsInstantiated();

        verify(repository).cleanUpExpiredSessions();
        verifyNoMoreInteractions(repository);
    }

    // AC-4: 掃除が失敗しても例外を投げず（起動を止めず）、WARN を残す。
    @ParameterizedTest
    @MethodSource("failures")
    void failureDoesNotStopStartupAndIsLoggedAsWarn(RuntimeException failure, CapturedOutput output) {
        doThrow(failure).when(repository).cleanUpExpiredSessions();

        assertThatCode(cleanup::afterSingletonsInstantiated).doesNotThrowAnyException();

        assertThat(output.getAll())
                .contains("WARN")
                .contains("Failed to clean up expired sessions on startup")
                .contains(failure.getClass().getSimpleName());
    }
}

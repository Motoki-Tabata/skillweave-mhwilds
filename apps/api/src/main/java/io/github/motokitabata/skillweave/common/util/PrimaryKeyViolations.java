package io.github.motokitabata.skillweave.common.util;

import java.sql.SQLException;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

/** {@link DataIntegrityViolationException} のうち、主キー違反だけを見分ける。 */
public final class PrimaryKeyViolations {

    private static final String UNIQUE_VIOLATION = "23505";

    private PrimaryKeyViolations() {}

    /**
     * 原因が、名前が {@code primaryKey} の制約の違反なら true。Hibernate が制約名を取り出せないときだけ、
     * SQLState 23505（一意制約の違反）で判定する。外部キー・CHECK・文字コード等の拒否は false。
     */
    public static boolean isViolationOf(DataIntegrityViolationException e, String primaryKey) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof ConstraintViolationException cve && cve.getConstraintName() != null) {
                return primaryKey.equals(cve.getConstraintName());
            }
            if (t instanceof SQLException sql) {
                return UNIQUE_VIOLATION.equals(sql.getSQLState());
            }
        }
        return false;
    }
}

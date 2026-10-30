package io.github.motokitabata.skillweave.common.util;

import java.util.Optional;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;

/** {@link DataIntegrityViolationException} から違反した制約の名前を取り出す。 */
public final class ConstraintViolations {

    private ConstraintViolations() {}

    /** Hibernate が制約名を取り出せたときだけ返す。取り出せないときは空（SQLState だけでは制約を決められない）。 */
    public static Optional<String> constraintName(DataIntegrityViolationException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof ConstraintViolationException cve && cve.getConstraintName() != null) {
                return Optional.of(cve.getConstraintName());
            }
        }
        return Optional.empty();
    }
}

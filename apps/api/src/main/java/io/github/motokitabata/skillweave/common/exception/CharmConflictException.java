package io.github.motokitabata.skillweave.common.exception;

/** ID の衝突、または行バージョンの不一致。409 になる。 */
public class CharmConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public CharmConflictException(String message) {
        super(message);
    }

    public CharmConflictException(String message, Throwable cause) {
        super(message, cause);
    }
}

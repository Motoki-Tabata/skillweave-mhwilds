package io.github.motokitabata.skillweave.common.exception;

/** 構成の ID の衝突、または行バージョンの不一致。409 になる。 */
public class BuildConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public BuildConflictException(String message) {
        super(message);
    }

    public BuildConflictException(String message, Throwable cause) {
        super(message, cause);
    }
}

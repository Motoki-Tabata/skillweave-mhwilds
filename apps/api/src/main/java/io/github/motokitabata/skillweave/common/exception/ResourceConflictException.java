package io.github.motokitabata.skillweave.common.exception;

/** ID の衝突、または行バージョンの不一致。409 になる。文言は呼び出し側が渡す。 */
public class ResourceConflictException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ResourceConflictException(String message) {
        super(message);
    }

    public ResourceConflictException(String message, Throwable cause) {
        super(message, cause);
    }
}

package io.github.motokitabata.skillweave.common.exception;

/** 対象のリソースが無い（他のユーザーの行を含む）。404 になる。文言は呼び出し側が渡す。 */
public class ResourceNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ResourceNotFoundException(String message) {
        super(message);
    }
}

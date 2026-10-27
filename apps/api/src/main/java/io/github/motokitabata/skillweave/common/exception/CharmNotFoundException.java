package io.github.motokitabata.skillweave.common.exception;

/** 自分の削除していない護石が無い（他のユーザーの行を含む）。404 になる。 */
public class CharmNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public CharmNotFoundException() {
        super("Charm not found");
    }
}

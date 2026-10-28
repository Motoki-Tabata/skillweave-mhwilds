package io.github.motokitabata.skillweave.common.exception;

/** 自分の削除していない構成が無い（他のユーザーの行を含む）。404 になる。 */
public class BuildNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public BuildNotFoundException() {
        super("Build not found");
    }
}

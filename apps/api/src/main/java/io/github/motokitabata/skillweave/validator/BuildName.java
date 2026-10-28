package io.github.motokitabata.skillweave.validator;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 構成名の規則。Unicode のコードポイントで 1〜50 個で、先頭と末尾が ECMAScript の
 * {@code String.prototype.trim()} が除く空白でないこと。null は検査しない（{@code @NotNull} と併用する）。
 */
@Documented
@Constraint(validatedBy = BuildNameValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface BuildName {

    String message() default "must be 1 to 50 code points without leading or trailing whitespace";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}

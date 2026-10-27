package io.github.motokitabata.skillweave.validator;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** UUID の版が 7 で、variant が RFC 4122 であること。null は検査しない（{@code @NotNull} と併用する）。 */
@Documented
@Constraint(validatedBy = UuidV7Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface UuidV7 {

    String message() default "must be a UUIDv7";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}

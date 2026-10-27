package io.github.motokitabata.skillweave.validator;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.util.UUID;

public class UuidV7Validator implements ConstraintValidator<UuidV7, UUID> {

    private static final int VERSION_7 = 7;
    private static final int VARIANT_RFC_4122 = 2;

    @Override
    public boolean isValid(UUID value, ConstraintValidatorContext context) {
        return value == null || (value.version() == VERSION_7 && value.variant() == VARIANT_RFC_4122);
    }
}

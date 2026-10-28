package io.github.motokitabata.skillweave.validator;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * 空白の集合は ECMAScript の WhiteSpace と LineTerminator に合わせる。
 * Java の {@code \s}・{@code Character.isWhitespace}・{@code String.strip} は集合が違う（U+00A0・U+FEFF を含まず、
 * U+001C〜U+001F を含む）ので使わない。{@code @Size} は UTF-16 の単位で数えるので使わない。
 */
public class BuildNameValidator implements ConstraintValidator<BuildName, String> {

    static final int MAX_CODE_POINTS = 50;

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }
        int count = value.codePointCount(0, value.length());
        if (count < 1 || count > MAX_CODE_POINTS) {
            return false;
        }
        return !isEcmaWhitespace(value.codePointAt(0)) && !isEcmaWhitespace(value.codePointBefore(value.length()));
    }

    static boolean isEcmaWhitespace(int cp) {
        return switch (cp) {
            case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF ->
                true;
            default -> cp >= 0x2000 && cp <= 0x200A;
        };
    }
}

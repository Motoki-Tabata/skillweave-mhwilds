package io.github.motokitabata.skillweave.service;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/** 共有の短縮 ID（base62 の 12 字）を暗号論的な乱数で採番する。 */
@Component
public class ShortIdGenerator {

    static final int LENGTH = 12;
    private static final String ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    private final SecureRandom random = new SecureRandom();

    /** 1 字ずつ {@code nextInt(62)} で選ぶので、剰余の偏りが無い。 */
    public String generate() {
        StringBuilder sb = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}

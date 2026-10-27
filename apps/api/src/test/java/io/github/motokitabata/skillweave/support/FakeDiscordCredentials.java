package io.github.motokitabata.skillweave.support;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.test.context.TestPropertySource;

/**
 * Discord のクライアント ID・シークレットに偽の値を与える（main の application.yml は既定値を持たない）。
 * 実際の Discord には接続しない。{@code @SpringBootTest} のテストクラスに付ける。
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@TestPropertySource(properties = {"DISCORD_CLIENT_ID=test-client", "DISCORD_CLIENT_SECRET=test-secret"})
public @interface FakeDiscordCredentials {}

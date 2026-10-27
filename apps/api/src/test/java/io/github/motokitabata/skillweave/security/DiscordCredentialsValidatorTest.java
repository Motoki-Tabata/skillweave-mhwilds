package io.github.motokitabata.skillweave.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.security.oauth2.client.autoconfigure.OAuth2ClientAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * 受入基準 13: Discord のクライアント ID・シークレットが未設定・空なら起動に失敗する。
 * 実際の application.yml を読み、環境変数の値だけをプロパティで与える。
 */
class DiscordCredentialsValidatorTest {

    private static final String ID = "DISCORD_CLIENT_ID=";
    private static final String SECRET = "DISCORD_CLIENT_SECRET=";

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withConfiguration(AutoConfigurations.of(OAuth2ClientAutoConfiguration.class))
            .withBean(DiscordCredentialsValidator.class)
            .withPropertyValues(
                    "spring.profiles.active=none",
                    "swv.auth.session-timeout=30d",
                    "spring.security.oauth2.client.registration.discord.redirect-uri=http://localhost/cb");

    @Test
    void startsWhenBothAreSet() {
        runner.withPropertyValues(ID + "id", SECRET + "secret")
                .run(ctx -> assertThat(ctx).hasNotFailed());
    }

    @Test
    void failsWhenIdIsEmpty() {
        runner.withPropertyValues(ID, SECRET + "secret")
                .run(ctx -> assertThat(ctx).hasFailed().getFailure().rootCause().hasMessageContaining("Client id"));
    }

    @Test
    void failsWhenSecretIsEmpty() {
        runner.withPropertyValues(ID + "id", SECRET)
                .run(ctx -> assertThat(ctx)
                        .hasFailed()
                        .getFailure()
                        .rootCause()
                        .hasMessageContaining("DISCORD_CLIENT_SECRET"));
    }

    @Test
    void failsWhenSecretIsBlank() {
        runner.withPropertyValues(ID + "id", SECRET + "  ")
                .run(ctx -> assertThat(ctx)
                        .hasFailed()
                        .getFailure()
                        .rootCause()
                        .hasMessageContaining("DISCORD_CLIENT_SECRET"));
    }
}

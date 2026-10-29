package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import io.github.motokitabata.skillweave.SkillweaveApplication;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.env.Profiles;

/**
 * 本番プロファイルの必須の環境変数の検証（028 api-prod-config の AC-7）。
 * 失敗の経路は実際の起動（{@code SkillweaveApplication.application()}）で確かめる。
 */
@ExtendWith(OutputCaptureExtension.class)
class ProdEnvironmentValidatorTest {

    private static final String REDIRECT = "DISCORD_REDIRECT_URI";
    private static final String WEB_TOP = "SWV_WEB_TOP_URL";
    private static final String PROD = "--spring.profiles.active=prod";
    private static final String NO_WEB = "--spring.main.web-application-type=none";
    private static final String VALUE = "https://swv.example/x";

    static Stream<Arguments> missing() {
        return Stream.of(
                Arguments.of(List.of("--" + REDIRECT + "=", "--" + WEB_TOP + "=" + VALUE), REDIRECT, WEB_TOP),
                Arguments.of(List.of("--" + REDIRECT + "=" + VALUE, "--" + WEB_TOP + "="), WEB_TOP, REDIRECT),
                Arguments.of(List.of("--" + REDIRECT + "=", "--" + WEB_TOP + "="), REDIRECT + ", " + WEB_TOP, null));
    }

    // AC-7: 空のとき起動に失敗し、欠けた環境変数名だけをメッセージとログに出す。
    @ParameterizedTest
    @MethodSource("missing")
    void emptyValuesFailStartupNamingMissingVariables(
            List<String> values, String named, String notNamed, CapturedOutput output) {
        String[] args = Stream.concat(Stream.of(PROD, NO_WEB), values.stream()).toArray(String[]::new);

        assertThatThrownBy(() -> SkillweaveApplication.application().run(args))
                .hasMessageContaining("are not set: " + named)
                .satisfies(e -> {
                    if (notNamed != null) {
                        assertThat(e.getMessage()).doesNotContain(notNamed);
                    }
                });
        assertThat(output.getAll()).contains(named);
    }

    // AC-7: 未設定（引数なし）でも同じく失敗し、両方の名前を出す。
    @Test
    void unsetValuesFailStartup(CapturedOutput output) {
        assumeTrue(System.getenv(REDIRECT) == null && System.getenv(WEB_TOP) == null);

        assertThatThrownBy(() -> SkillweaveApplication.application().run(PROD, NO_WEB))
                .hasMessageContaining(REDIRECT)
                .hasMessageContaining(WEB_TOP);
        assertThat(output.getAll()).contains(REDIRECT).contains(WEB_TOP);
    }

    private static ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withInitializer(new ProdEnvironmentValidator());
    }

    // AC-7: 本番で両方あるときは失敗しない。
    @Test
    void prodWithBothValuesStarts() {
        runner().withPropertyValues(PROD.substring(2), REDIRECT + "=" + VALUE, WEB_TOP + "=" + VALUE)
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx.getEnvironment().acceptsProfiles(Profiles.of("prod")))
                            .isTrue();
                });
    }

    // AC-7: 本番でなければ、値が無くても検証しない。
    @Test
    void nonProdWithoutValuesStarts() {
        runner().withPropertyValues("spring.profiles.active=local")
                .run(ctx -> assertThat(ctx).hasNotFailed());
    }
}

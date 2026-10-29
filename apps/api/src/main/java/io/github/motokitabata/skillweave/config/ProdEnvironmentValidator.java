package io.github.motokitabata.skillweave.config;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.Profiles;

/**
 * 本番プロファイルで必須の環境変数が未設定・空なら、Bean の生成より前に起動を止める。
 * 欠けた環境変数名を例外のメッセージに含める（Boot の登録検証は変数名を示さない）。
 */
public class ProdEnvironmentValidator implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    private static final Map<String, String> REQUIRED = Map.of(
            "DISCORD_REDIRECT_URI", "spring.security.oauth2.client.registration.discord.redirect-uri",
            "SWV_WEB_TOP_URL", "swv.auth.web-top-url");

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        ConfigurableEnvironment environment = context.getEnvironment();
        if (!environment.acceptsProfiles(Profiles.of("prod"))) {
            return;
        }
        List<String> missing = new ArrayList<>();
        REQUIRED.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> {
            String value = environment.getProperty(e.getValue());
            if (value == null || value.isBlank()) {
                missing.add(e.getKey());
            }
        });
        if (!missing.isEmpty()) {
            throw new IllegalStateException(
                    "Required environment variables for the prod profile are not set: " + String.join(", ", missing));
        }
    }
}

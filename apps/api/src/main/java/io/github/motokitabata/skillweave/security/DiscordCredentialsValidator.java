package io.github.motokitabata.skillweave.security;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.util.Assert;

/**
 * Discord のクライアント ID・シークレットが空なら起動に失敗させる（受入基準 13）。
 * application.yml は環境変数の既定値を空にしている（既定値が無いと、Boot は未解決の
 * プレースホルダを文字列のまま値にして起動してしまう）。ID は Boot の登録検証が、
 * シークレットはここで検査する。
 */
public class DiscordCredentialsValidator implements InitializingBean {

    static final String REGISTRATION_ID = "discord";

    private final ClientRegistrationRepository repository;

    public DiscordCredentialsValidator(ClientRegistrationRepository repository) {
        this.repository = repository;
    }

    @Override
    public void afterPropertiesSet() {
        ClientRegistration registration = repository.findByRegistrationId(REGISTRATION_ID);
        Assert.state(registration != null, "OAuth2 client registration 'discord' is missing");
        Assert.hasText(registration.getClientId(), "DISCORD_CLIENT_ID must be set");
        Assert.hasText(registration.getClientSecret(), "DISCORD_CLIENT_SECRET must be set");
    }
}

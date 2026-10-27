package io.github.motokitabata.skillweave.security;

import java.util.Map;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;

/**
 * Discord のユーザー情報（{@code /users/@me}）を取得する。テストで差し替えるために分けてある。
 */
@FunctionalInterface
public interface DiscordUserFetcher {

    Map<String, Object> fetch(OAuth2UserRequest userRequest);
}

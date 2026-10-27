package io.github.motokitabata.skillweave.security;

import io.github.motokitabata.skillweave.repository.UserRepository;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

/**
 * Discord のユーザー情報から {@code users} の行を作成または再利用し、セッションに入れる主体を返す。
 * メールアドレスと表示名は DB に書かない。
 */
@Service
public class DiscordOAuth2UserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    static final String INVALID_USER_INFO = "invalid_user_info";

    private static final Pattern DISCORD_ID = Pattern.compile("^\\d{1,20}$");

    private final DiscordUserFetcher fetcher;
    private final UserRepository userRepository;

    public DiscordOAuth2UserService(DiscordUserFetcher fetcher, UserRepository userRepository) {
        this.fetcher = fetcher;
        this.userRepository = userRepository;
    }

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        Map<String, Object> attributes = fetcher.fetch(userRequest);
        String discordId = text(attributes.get("id"));
        if (discordId == null || !DISCORD_ID.matcher(discordId).matches()) {
            throw new OAuth2AuthenticationException(new OAuth2Error(INVALID_USER_INFO));
        }
        String displayName = text(attributes.get("global_name"));
        if (displayName == null) {
            displayName = text(attributes.get("username"));
        }
        if (displayName == null) {
            displayName = discordId;
        }
        UUID userId = userRepository.findOrCreateByDiscordId(discordId);
        return new DiscordUserPrincipal(userId, displayName);
    }

    private static String text(Object value) {
        if (value instanceof String s && !s.isBlank()) {
            return s;
        }
        if (value instanceof Number n) {
            return n.toString();
        }
        return null;
    }
}

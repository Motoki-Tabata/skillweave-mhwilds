package io.github.motokitabata.skillweave.security;

import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

/**
 * セッションに入る認証の主体。内部のユーザー ID と表示名だけを持つ（Discord の他の属性は持たない）。
 */
public record DiscordUserPrincipal(UUID userId, String displayName) implements OAuth2User, Serializable {

    private static final long serialVersionUID = 1L;

    @Override
    public Map<String, Object> getAttributes() {
        return Map.of("displayName", displayName);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    @Override
    public String getName() {
        return userId.toString();
    }
}

package io.github.motokitabata.skillweave.config;

import io.github.motokitabata.skillweave.security.DiscordCredentialsValidator;
import io.github.motokitabata.skillweave.security.DiscordOAuth2UserService;
import io.github.motokitabata.skillweave.security.DiscordUserFetcher;
import io.github.motokitabata.skillweave.security.ProblemDetailAuthenticationEntryPoint;
import io.github.motokitabata.skillweave.security.SessionCookieRefreshFilter;
import io.github.motokitabata.skillweave.security.ShortLivedAuthorizationRequestRepository;
import io.github.motokitabata.skillweave.security.WebTopRedirectHandler;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfLogoutHandler;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.savedrequest.NullRequestCache;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.session.web.http.CookieSerializer;
import tools.jackson.databind.ObjectMapper;

/** 認証の設定（009 discord-login）。 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(SecurityConfig.AuthProperties.class)
public class SecurityConfig {

    private static final String AUTHORIZATION_BASE = "/api/oauth2/authorization";
    private static final String CALLBACK_PATTERN = "/api/login/oauth2/code/*";

    /** {@code swv.auth.*}。セッションの有効期間は application.yml で Spring のキーへ渡す。 */
    @ConfigurationProperties("swv.auth")
    public record AuthProperties(
            @DefaultValue("/") String webTopUrl,
            @DefaultValue("30d") Duration sessionTimeout,
            @DefaultValue("10m") Duration authorizationSessionTimeout) {}

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            AuthProperties authProperties,
            DiscordOAuth2UserService userService,
            OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenResponseClient,
            CsrfTokenRepository csrfTokenRepository,
            CookieSerializer cookieSerializer,
            ObjectMapper objectMapper) {
        WebTopRedirectHandler redirectHandler =
                new WebTopRedirectHandler(authProperties.webTopUrl(), authProperties.sessionTimeout());
        ProblemDetailAuthenticationEntryPoint entryPoint = new ProblemDetailAuthenticationEntryPoint(objectMapper);

        // ERROR ディスパッチ（/error）は許可する。元の認可はすでに済んでおり、denyAll がかかると 404・500 が 403 に化けるため。
        // /error への直接の要求は REQUEST ディスパッチなので、下の denyAll で拒否される。
        http.authorizeHttpRequests(auth -> auth.dispatcherTypeMatchers(DispatcherType.ERROR)
                        .permitAll()
                        .requestMatchers(
                                getOrHead(AUTHORIZATION_BASE + "/**"),
                                getOrHead(CALLBACK_PATTERN),
                                getOrHead("/v3/api-docs/**"),
                                getOrHead("/swagger-ui/**"),
                                getOrHead("/swagger-ui.html"),
                                getOrHead("/actuator/health/**"),
                                getOrHead("/actuator/info"))
                        .permitAll()
                        .requestMatchers(
                                PathPatternRequestMatcher.withDefaults().matcher("/api/**"))
                        .authenticated()
                        .anyRequest()
                        .denyAll())
                .csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokenRepository))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(cache -> cache.requestCache(new NullRequestCache()))
                .exceptionHandling(e -> e.authenticationEntryPoint(entryPoint))
                .oauth2Login(login -> login.authorizationEndpoint(a -> a.baseUri(AUTHORIZATION_BASE)
                                .authorizationRequestRepository(new ShortLivedAuthorizationRequestRepository(
                                        authProperties.authorizationSessionTimeout())))
                        .redirectionEndpoint(r -> r.baseUri(CALLBACK_PATTERN))
                        .tokenEndpoint(t -> t.accessTokenResponseClient(tokenResponseClient))
                        .userInfoEndpoint(u -> u.userService(userService))
                        .successHandler(redirectHandler)
                        .failureHandler(redirectHandler))
                .addFilterAfter(new SessionCookieRefreshFilter(cookieSerializer), SecurityContextHolderFilter.class);
        return http.build();
    }

    private static RequestMatcher getOrHead(String pattern) {
        PathPatternRequestMatcher.Builder builder = PathPatternRequestMatcher.withDefaults();
        return request -> builder.matcher(HttpMethod.GET, pattern).matches(request)
                || builder.matcher(HttpMethod.HEAD, pattern).matches(request);
    }

    // XSRF-TOKEN は JS（Web の http.ts）が読んでヘッダーに載せるため HttpOnly にしない（二重送信 Cookie）。
    @SuppressWarnings("java:S3330")
    @Bean
    CsrfTokenRepository csrfTokenRepository(
            @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie) {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        if (secureCookie) {
            // 本番は TLS を手前で終えて要求が http に見えても Secure を付ける（SESSION と同じキーでそろえる）。
            repository.setCookieCustomizer(cookie -> cookie.secure(true));
        }
        return repository;
    }

    @Bean
    DiscordCredentialsValidator discordCredentialsValidator(ClientRegistrationRepository repository) {
        return new DiscordCredentialsValidator(repository);
    }

    @Bean
    LogoutHandler csrfLogoutHandler(CsrfTokenRepository csrfTokenRepository) {
        return new CsrfLogoutHandler(csrfTokenRepository);
    }

    @Bean
    OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> authorizationCodeTokenResponseClient() {
        return new RestClientAuthorizationCodeTokenResponseClient();
    }

    @Bean
    DiscordUserFetcher discordUserFetcher() {
        DefaultOAuth2UserService delegate = new DefaultOAuth2UserService();
        return request -> delegate.loadUser(request).getAttributes();
    }

    /** Discord のアクセストークンはログインの後に使わないので保持しない。 */
    @Bean
    OAuth2AuthorizedClientRepository authorizedClientRepository() {
        return new OAuth2AuthorizedClientRepository() {
            @Override
            public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(
                    String clientRegistrationId, Authentication principal, HttpServletRequest request) {
                return null;
            }

            @Override
            public void saveAuthorizedClient(
                    OAuth2AuthorizedClient authorizedClient,
                    Authentication principal,
                    HttpServletRequest request,
                    HttpServletResponse response) {
                // 保持しない
            }

            @Override
            public void removeAuthorizedClient(
                    String clientRegistrationId,
                    Authentication principal,
                    HttpServletRequest request,
                    HttpServletResponse response) {
                // 保持しない
            }
        };
    }
}

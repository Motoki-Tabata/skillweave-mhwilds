package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import io.github.motokitabata.skillweave.TestcontainersConfiguration;
import io.github.motokitabata.skillweave.service.ShareService;
import io.github.motokitabata.skillweave.support.FakeDiscordCredentials;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 構造化ログの stack_trace と、要求の処理中の想定外の例外（041 api-structured-log の AC-5・AC-6）。
 * このクラスだけのコンテキストにし（{@code @DirtiesContext}）、ログの仕組みを他のクラスと使い回さない。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@FakeDiscordCredentials
@ActiveProfiles("prod")
@TestPropertySource(
        properties = {
            "DISCORD_REDIRECT_URI=https://swv.example/api/login/oauth2/code/discord",
            "SWV_WEB_TOP_URL=https://swv.example/"
        })
@ExtendWith(OutputCaptureExtension.class)
@DirtiesContext
class StructuredLogRequestTest {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final Logger LOG = LoggerFactory.getLogger(StructuredLogRequestTest.class);

    @LocalServerPort
    private int port;

    @MockitoBean
    private ShareService shareService;

    private static String printed(Throwable t) {
        StringWriter sw = new StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        return sw.toString().stripTrailing();
    }

    private static List<Map<String, Object>> events(CapturedOutput output) {
        return output.getOut()
                .lines()
                .filter(l -> l.startsWith("{"))
                .map(l -> MAPPER.readValue(l, new TypeReference<Map<String, Object>>() {}))
                .toList();
    }

    private static boolean hasErrorTrace(Map<String, Object> e, String expected) {
        return "ERROR".equals(e.get("severity"))
                && e.get("stack_trace") instanceof String s
                && s.stripTrailing().equals(expected);
    }

    // AC-6: 応答に変えられない例外は、severity が ERROR で stack_trace にその例外を持つ 1 行の JSON になる。
    @Test
    void unexpectedExceptionInRequestIsLoggedAsError(CapturedOutput output) throws Exception {
        IllegalStateException boom = new IllegalStateException("structured-log-request-boom");
        when(shareService.view(anyString())).thenThrow(boom);

        HttpResponse<String> res = HttpClient.newHttpClient()
                .send(
                        HttpRequest.newBuilder(
                                        URI.create("http://localhost:" + port + "/api/shared-builds/abcdef123456"))
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());

        assertThat(res.statusCode()).isEqualTo(500);
        String expected = printed(boom);
        assertThat(events(output)).anyMatch(e -> hasErrorTrace(e, expected));
    }

    private static IllegalArgumentException nested() {
        try {
            try {
                throw new IllegalStateException("inner-cause");
            } catch (IllegalStateException inner) {
                throw new RuntimeException("middle-cause", inner);
            }
        } catch (RuntimeException middle) {
            return new IllegalArgumentException("outer", middle);
        }
    }

    // AC-5: 原因の連なりを持つ例外が、printStackTrace() の書式で stack_trace に入る。
    @Test
    void slf4jExceptionIsPrintedInStandardFormat(CapturedOutput output) {
        IllegalArgumentException ex = nested();

        LOG.error("structured-log-slf4j", ex);

        String expected = printed(ex);
        assertThat(expected).contains("Caused by:").containsPattern("\\.\\.\\. \\d+ more");
        assertThat(events(output)).anyMatch(e -> hasErrorTrace(e, expected));
    }
}

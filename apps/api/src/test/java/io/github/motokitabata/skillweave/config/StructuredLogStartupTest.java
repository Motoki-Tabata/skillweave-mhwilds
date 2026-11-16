package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.motokitabata.skillweave.SkillweaveApplication;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 構造化ログ（041 api-structured-log の AC-1〜AC-5・AC-7・AC-8）。
 * ログの仕組みは {@code SpringApplication.run} のたびに作り直されるので、アプリを明示的に起動して確かめる
 * （キャッシュされたテストのコンテキストの使い回しに形式を左右されない）。DB には届かない URL を渡す。
 */
@ExtendWith(OutputCaptureExtension.class)
class StructuredLogStartupTest {

    // 先に走った prod の SpringBootTest が System のプロパティに残した形式を消し、このクラスの起動を前のクラスに左右させない。
    @BeforeEach
    void clearLeakedLoggingProperties() {
        System.clearProperty("CONSOLE_LOG_STRUCTURED_FORMAT");
        System.clearProperty("FILE_LOG_STRUCTURED_FORMAT");
    }

    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final String STARTING = "using Java";
    private static final String PORT = "--server.port=0";
    private static final String[] DB_ARGS = {
        "--spring.datasource.url=jdbc:postgresql://localhost:1/x",
        "--spring.datasource.username=u",
        "--spring.datasource.password=p",
        "--DISCORD_CLIENT_ID=test-client",
        "--DISCORD_CLIENT_SECRET=test-secret"
    };

    private static String[] args(String profile, String... extra) {
        return Stream.concat(
                        Stream.of("--spring.profiles.active=" + profile, PORT),
                        Stream.concat(Arrays.stream(DB_ARGS), Arrays.stream(extra)))
                .toArray(String[]::new);
    }

    private static String severityOf(String level) {
        return switch (level) {
            case "ERROR" -> "ERROR";
            case "WARN" -> "WARNING";
            case "INFO" -> "INFO";
            case "DEBUG", "TRACE" -> "DEBUG";
            default -> "DEFAULT";
        };
    }

    private static List<String> lines(CapturedOutput output) {
        return output.getOut().lines().filter(l -> !l.isBlank()).toList();
    }

    // AC-1〜AC-5・AC-7: prod の起動のログは全行が 1 行の JSON で、message・severity・time・stack_trace を持つ。
    @Test
    void prodStartupLogsAreOneLineJson(CapturedOutput output) {
        String[] args = args(
                "prod",
                "--DISCORD_REDIRECT_URI=https://swv.example/api/login/oauth2/code/discord",
                "--SWV_WEB_TOP_URL=https://swv.example/");

        assertThatThrownBy(() -> SkillweaveApplication.application().run(args)).isNotNull();

        List<String> lines = lines(output);
        assertThat(lines).isNotEmpty();
        List<Map<String, Object>> events = lines.stream()
                .map(l -> MAPPER.readValue(l, new TypeReference<Map<String, Object>>() {})) // AC-1
                .toList();
        assertThat(events).anySatisfy(e -> assertThat((String) e.get("message")).contains(STARTING)); // AC-1・AC-2
        assertThat(events).allSatisfy(e -> {
            assertThat(e.get("message")).isInstanceOf(String.class); // AC-2
            assertThat(e.get("severity")).isEqualTo(severityOf((String) e.get("level"))); // AC-3
            assertThat(OffsetDateTime.parse((String) e.get("time"))).isNotNull(); // AC-4
            assertThat(e).doesNotContainKey("@timestamp"); // AC-4
        });
        assertThat(events).anySatisfy(e -> assertThat(e.get("severity")).isEqualTo("WARNING")); // AC-3
        assertThat(events)
                .filteredOn(e -> "org.springframework.boot.SpringApplication".equals(e.get("logger_name")))
                .isNotEmpty()
                .allSatisfy(e -> {
                    assertThat(e.get("severity")).isEqualTo("ERROR"); // AC-7
                    String trace = (String) e.get("stack_trace");
                    assertThat(trace)
                            .contains("Caused by: ")
                            .contains("java.net.ConnectException")
                            .containsPattern("\t\\.\\.\\. \\d+ more")
                            .doesNotContain("common frames omitted"); // AC-5
                });
    }

    // AC-8: training は構造化ログにならない。
    @Test
    void trainingStaysPlainText(CapturedOutput output) {
        try (ConfigurableApplicationContext context =
                SkillweaveApplication.application().run("--spring.profiles.active=training", PORT)) {
            assertThat(context.isActive()).isTrue();
        }

        assertThat(output.getOut()).contains(STARTING);
        assertThat(lines(output)).noneMatch(l -> l.startsWith("{"));
    }

    // AC-8: local は今の平文のまま（スタックトレースが別の行に分かれる）。
    @Test
    void localStaysPlainText(CapturedOutput output) {
        String[] args = args("local");

        assertThatThrownBy(() -> SkillweaveApplication.application().run(args)).isNotNull();

        assertThat(output.getOut()).contains(STARTING);
        assertThat(lines(output)).noneMatch(l -> l.startsWith("{")).anyMatch(l -> l.startsWith("\tat "));
    }
}

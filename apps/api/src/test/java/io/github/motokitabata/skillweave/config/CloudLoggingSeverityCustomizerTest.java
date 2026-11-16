package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.LoggingEvent;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.json.JsonWriter;

/** 構造化ログの severity の読み替え（041 api-structured-log の AC-3）。Spring は起動しない。 */
class CloudLoggingSeverityCustomizerTest {

    // AC-3: Logback のレベルが LogSeverity の値に読み替わる。
    @ParameterizedTest
    @CsvSource({"ERROR,ERROR", "WARN,WARNING", "INFO,INFO", "DEBUG,DEBUG", "TRACE,DEBUG"})
    void mapsLevelToSeverity(String level, String severity) {
        JsonWriter<ILoggingEvent> writer = JsonWriter.of(new CloudLoggingSeverityCustomizer()::customize);
        Logger logger = new LoggerContext().getLogger("t");
        LoggingEvent event = new LoggingEvent(Logger.FQCN, logger, Level.valueOf(level), "m", null, null);

        assertThat(writer.writeToString(event)).contains("\"severity\":\"" + severity + "\"");
    }
}

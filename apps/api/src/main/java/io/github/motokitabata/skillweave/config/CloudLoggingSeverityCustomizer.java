package io.github.motokitabata.skillweave.config;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import org.springframework.boot.json.JsonWriter;
import org.springframework.boot.logging.structured.StructuredLoggingJsonMembersCustomizer;

/**
 * 構造化ログ（prod）に、Cloud Logging の LogSeverity の値を {@code severity} として足す。
 * {@code logging.structured.json.customizer} の FQCN から Spring Boot が引数なしで作る。
 */
public class CloudLoggingSeverityCustomizer implements StructuredLoggingJsonMembersCustomizer<ILoggingEvent> {

    @Override
    public void customize(JsonWriter.Members<ILoggingEvent> members) {
        members.add("severity", ILoggingEvent::getLevel).as(CloudLoggingSeverityCustomizer::severity);
    }

    private static String severity(Level level) {
        return switch (level.toInt()) {
            case Level.ERROR_INT -> "ERROR";
            case Level.WARN_INT -> "WARNING";
            case Level.INFO_INT -> "INFO";
            case Level.DEBUG_INT, Level.TRACE_INT -> "DEBUG";
            default -> "DEFAULT";
        };
    }
}

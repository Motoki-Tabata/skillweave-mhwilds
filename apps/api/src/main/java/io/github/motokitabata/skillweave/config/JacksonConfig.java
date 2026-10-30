package io.github.motokitabata.skillweave.config;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.deser.std.StdScalarDeserializer;
import tools.jackson.databind.module.SimpleModule;

/**
 * 要求の本文の文字列の項目を厳しく読む（013 AC-11）。JSON の文字列だけを受け付け、U+0000 を含む文字列は
 * 取り除かずに拒否する。拒否は読み取りの失敗になり、400 になる。
 * {@code allow-coercion-of-scalars: false} は数値・真偽から String への変換を止めないので、deserializer で止める。
 */
@Configuration(proxyBeanMethods = false)
public class JacksonConfig {

    @Bean
    JsonMapperBuilderCustomizer strictStringCustomizer() {
        return builder -> builder.addModule(
                new SimpleModule("strict-string").addDeserializer(String.class, new StrictStringDeserializer()));
    }

    static final class StrictStringDeserializer extends StdScalarDeserializer<String> {

        private static final long serialVersionUID = 1L;

        StrictStringDeserializer() {
            super(String.class);
        }

        @Override
        public String deserialize(JsonParser p, DeserializationContext ctxt) {
            if (!p.hasToken(JsonToken.VALUE_STRING)) {
                return (String) ctxt.handleUnexpectedToken(String.class, p);
            }
            String value = p.getString();
            if (value.indexOf('\u0000') >= 0) {
                return (String) ctxt.handleWeirdStringValue(String.class, value, "contains U+0000");
            }
            return value;
        }

        @Override
        public Object getNullValue(DeserializationContext ctxt) {
            return null;
        }
    }
}

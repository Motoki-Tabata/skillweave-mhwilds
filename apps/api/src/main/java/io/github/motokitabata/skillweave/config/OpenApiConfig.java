package io.github.motokitabata.skillweave.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI skillweaveOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Skillweave for MH Wilds API")
                        .description("Skillweave for MH Wilds バックエンド API")
                        .version("v0"));
    }
}

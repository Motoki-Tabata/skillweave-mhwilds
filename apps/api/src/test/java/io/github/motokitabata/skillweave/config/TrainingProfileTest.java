package io.github.motokitabata.skillweave.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.motokitabata.skillweave.SkillweaveApplication;
import org.junit.jupiter.api.Test;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * AOT キャッシュの訓練用プロファイル（035 api-aot-cache の AC-6）。
 * DB に接続できず Testcontainers も使わない状態で、実際の起動の経路を通して refresh が最後まで通ることを確かめる。
 */
class TrainingProfileTest {

    // AC-6: training プロファイルで DB に接続できなくても、コンテキストが refresh を最後まで通る。
    // AC-7: application-training.yml から方言の指定を外すとこのテストは失敗する（区間 D で確認済み）。
    @Test
    void contextRefreshesWithoutDatabase() {
        try (ConfigurableApplicationContext context =
                SkillweaveApplication.application().run("--spring.profiles.active=training", "--server.port=0")) {
            assertThat(context.isActive()).isTrue();
            assertThat(context.getEnvironment().getActiveProfiles()).containsExactly("training");
        }
    }
}

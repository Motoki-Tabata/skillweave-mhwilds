package io.github.motokitabata.skillweave;

import io.github.motokitabata.skillweave.config.ProdEnvironmentValidator;
import io.github.motokitabata.skillweave.constant.TimeZones;
import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SkillweaveApplication {

    public static void main(String[] args) {
        // spring.jackson.time-zone は Jackson のシリアライズにしか効かず、
        // ZoneId.systemDefault() 自体は変わらない。起動方法（IDE / gradlew bootRun /
        // java -jar / コンテナ）に関わらず JVM 全体のデフォルトTZを確実に UTC にするため、
        // 起動直後に設定する（-Duser.timezone には依存しない）。
        TimeZone.setDefault(TimeZone.getTimeZone(TimeZones.UTC));

        application().run(args);
    }

    /** 本番プロファイルの必須の環境変数の検証を組み込んだ起動。 */
    public static SpringApplication application() {
        SpringApplication application = new SpringApplication(SkillweaveApplication.class);
        application.addInitializers(new ProdEnvironmentValidator());
        return application;
    }
}

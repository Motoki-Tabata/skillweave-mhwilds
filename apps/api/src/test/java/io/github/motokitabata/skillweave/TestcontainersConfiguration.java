package io.github.motokitabata.skillweave;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * テスト用の Testcontainers 定義。
 *
 * <p>H2 は使わず、本番と同じ PostgreSQL をそのまま使う（H2 と PostgreSQL の方言差を避けるため）。
 * イメージは docker/compose.yaml と同じ版にそろえる。
 *
 * <p>Testcontainers 2.0 で PostgreSQL の座標が
 * {@code org.testcontainers:testcontainers-postgresql} に変更され、
 * {@code PostgreSQLContainer} 自体が非ジェネリッククラスになった点に注意
 * （旧 1.x は {@code PostgreSQLContainer<SELF>} だった）。
 *
 * <p>{@code io.github.motokitabata.skillweave.contract} パッケージの contract テストからも
 * {@code @Import} で再利用するため public にしている。
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:18.6-trixie"));
    }
}

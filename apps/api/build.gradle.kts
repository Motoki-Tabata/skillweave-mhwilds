import org.springframework.boot.gradle.tasks.bundling.BootBuildImage

plugins {
    java
    // カバレッジ計測（ローカル限定。CI の build には組み込まない）。
    // Gradle 9 既定の JaCoCo が Java 25 に対応しているため toolVersion は固定しない（tech-stack.md）。
    jacoco
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spring.dependency.management)
    alias(libs.plugins.spotless)
}

group = "io.github.motokitabata"
version = "0.0.1-SNAPSHOT"
description = "Skillweave for MH Wilds API"

java {
    toolchain {
        // バージョンの正は gradle/libs.versions.toml の [versions] java。
        // ハードコードすると二重管理になるため参照する。
        languageVersion = JavaLanguageVersion.of(libs.versions.java.get().toInt())
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // --- Web / API ---
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation(libs.springdoc.openapi.starter.webmvc.ui)

    // --- 永続化 ---
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    // flyway-database-postgresql が無いと "Unsupported Database" で起動失敗する
    // （spring-boot-starter-flyway はこれを含まない。vim で実測）
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // --- 運用 ---
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    developmentOnly("org.springframework.boot:spring-boot-devtools")

    // --- テスト ---
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-restclient") // TestRestTemplate が RestTemplateBuilder を要求するため必要
    testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
    testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
    testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation(libs.testcontainers.postgresql)
    testImplementation(libs.testcontainers.junit.jupiter)
    // contracts/openapi.yaml（$ref込み）を解決してパースするための contractTest 専用依存
    testImplementation(libs.swagger.parser)
    // swagger-parser がテストクラスパスに乗ると、springdoc が /v3/api-docs を生成する際に
    // swagger-core のモデルクラス（Schema 等）が持つ @XmlElement の解決で
    // NoClassDefFoundError: javax/xml/bind/annotation/XmlElement が発生する
    // （javax.xml.bind は Java 11 で JDK 同梱が廃止された）。contractTest 実行時のみ必要。
    testRuntimeOnly(libs.jaxb.api)
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

// contractTest（下記）は @Tag("contract") で明示的に分離するため、
// 通常の test タスクからは除外する。
tasks.test {
    useJUnitPlatform {
        excludeTags("contract")
    }
}

// contracts/openapi.yaml（正）と実装（springdoc の実行時出力）を突合するタスク。
// 通常の test には含めず、CI で明示的に呼び出す（`./gradlew contractTest`）。
val contractsDir = rootProject.projectDir.parentFile.parentFile.resolve("contracts")

tasks.register<Test>("contractTest") {
    description = "OpenAPI 契約（contracts/openapi.yaml）と実装の突合を検証する。"
    group = "verification"
    testClassesDirs = sourceSets.test.get().output.classesDirs
    classpath = sourceSets.test.get().runtimeClasspath
    useJUnitPlatform {
        includeTags("contract")
    }
    // contracts/ はシステムプロパティ経由で実行時に読むだけなので、input として
    // 明示しないと Gradle の up-to-date 判定に乗らず、YAML だけ変更しても
    // タスクが UP-TO-DATE でスキップされてしまう（実機で確認済み）。
    inputs.dir(contractsDir).withPropertyName("contracts")
    // apps/api は独立した Gradle ルートのため、リポジトリ直下の contracts/ へは
    // 親ディレクトリ経由で参照する。
    systemProperty("swv.contracts.dir", contractsDir.absolutePath)
    shouldRunAfter(tasks.test)
}

// scripts/sonar-local.sh（ローカル限定の SonarQube 解析）が sonar.java.libraries /
// sonar.java.test.libraries に渡す classpath を書き出す。Sonar の Gradle プラグインを
// 依存に加えずに済ませるため、classpath の列挙だけをここで行う。
tasks.register("sonarClasspath") {
    description = "SonarQube 解析用の main/test classpath を build/sonar/ に書き出す。"
    group = "verification"
    val mainCp = sourceSets.main.get().compileClasspath
    val testCp = sourceSets.test.get().compileClasspath
    // スキャナ同梱の JRE ではなく、toolchain の JDK で java.* を解決させる（sonar.java.jdkHome）。
    val jdkHome = javaToolchains.launcherFor(java.toolchain).map { it.metadata.installationPath.asFile.absolutePath }
    val outDir = layout.buildDirectory.dir("sonar")
    inputs.files(mainCp, testCp)
    inputs.property("jdkHome", jdkHome)
    outputs.dir(outDir)
    doLast {
        val dir = outDir.get().asFile
        dir.mkdirs()
        dir.resolve("main-classpath.txt").writeText(mainCp.files.joinToString(","))
        dir.resolve("test-classpath.txt").writeText(testCp.files.joinToString(","))
        dir.resolve("jdk-home.txt").writeText(jdkHome.get())
    }
}

// カバレッジレポート（scripts/sonar-local.sh が XML を SonarQube へ渡す）。
// contractTest もコントローラを通すため、test と contractTest の両方の実行結果を集約する。
// dependsOn にしないのは、レポートだけ作り直すときにテストを再実行させないため
// （実行順は mustRunAfter で保証し、呼び出し側が `test contractTest jacocoTestReport` と並べる）。
// 採用判断の経緯は design/tech-stack.md「カバレッジのローカル計測」節を参照。
tasks.jacocoTestReport {
    executionData.setFrom(
        fileTree(layout.buildDirectory.dir("jacoco")) { include("test.exec", "contractTest.exec") }
    )
    mustRunAfter(tasks.test, tasks.named("contractTest"))
    reports {
        xml.required = true
        html.required = true
    }
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}

tasks.named<BootBuildImage>("bootBuildImage") {
    imageName.set("skillweave-mhwilds-api")
}

spotless {
    java {
        target("src/*/java/**/*.java")
        // バージョンを固定しない: Spotless は JVM バージョンごとに互換性のある
        // palantir-java-format のデフォルト版を自動選択する（JDK25+ 対応の判断を
        // Spotless 側に委ねる。vim で実測 — 手動でのバージョン固定は
        // 逆に JDK25 非対応バージョンを固定するリスクがある）。
        palantirJavaFormat()
        removeUnusedImports()
        importOrder()
        trimTrailingWhitespace()
        endWithNewline()
    }
}

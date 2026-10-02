package io.github.motokitabata.skillweave.constant;

import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * システム全体で使うタイムゾーン。JVM・PostgreSQL をすべて UTC に統一し、
 * 表示時にブラウザのローカル時刻へ変換する。現在時刻の取得では、JVM のデフォルト TZ に
 * 暗黙に依存せずこのゾーンを明示する。
 */
public final class TimeZones {

    /** 協定世界時。 */
    public static final ZoneId UTC = ZoneOffset.UTC;

    private TimeZones() {}
}

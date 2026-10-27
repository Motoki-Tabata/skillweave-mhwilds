package io.github.motokitabata.skillweave.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * アカウントの護石（{@code charms}）。ID はクライアント採番の UUIDv7。
 * 行バージョンは {@code @Version} で、{@code version} が null のうちは新規として {@code persist} される。
 */
@Entity
@Table(name = "charms")
public class Charm {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false)
    private CharmPayload payload;

    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;

    @Version
    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Charm() {}

    public Charm(UUID id, UUID userId, CharmPayload payload, int schemaVersion, Instant now) {
        this.id = id;
        this.userId = userId;
        this.payload = payload;
        this.schemaVersion = schemaVersion;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(CharmPayload payload, int schemaVersion, Instant now) {
        this.payload = payload;
        this.schemaVersion = schemaVersion;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public CharmPayload getPayload() {
        return payload;
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public Integer getVersion() {
        return version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}

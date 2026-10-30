package io.github.motokitabata.skillweave.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.domain.Persistable;

/**
 * 構成の共有（{@code shares}）。作成時点の構成の写しで、後から内容は変わらない。ID はクライアント採番の UUIDv7。
 * {@code @Version} を持たないので、{@link Persistable} で新規の間は INSERT にし、ID の衝突を主キー違反として表に出す。
 */
@Entity
@Table(name = "shares")
public class Share implements Persistable<UUID> {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "short_id", nullable = false, updatable = false)
    private String shortId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "build_id", nullable = false, updatable = false)
    private UUID buildId;

    @Column(name = "name", nullable = false, updatable = false)
    private String name;

    @Column(name = "master_version", nullable = false, updatable = false)
    private String masterVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, updatable = false)
    private BuildPayload payload;

    @Column(name = "schema_version", nullable = false, updatable = false)
    private int schemaVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Transient
    private boolean isNew = true;

    protected Share() {}

    public Share(UUID id, String shortId, Build build, Instant now) {
        this.id = id;
        this.shortId = shortId;
        this.userId = build.getUserId();
        this.buildId = build.getId();
        this.name = build.getName();
        this.masterVersion = build.getMasterVersion();
        this.payload = build.getPayload();
        this.schemaVersion = build.getSchemaVersion();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return isNew;
    }

    @PostPersist
    @PostLoad
    void markNotNew() {
        this.isNew = false;
    }

    public String getShortId() {
        return shortId;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getBuildId() {
        return buildId;
    }

    public String getName() {
        return name;
    }

    public String getMasterVersion() {
        return masterVersion;
    }

    public BuildPayload getPayload() {
        return payload;
    }

    public int getSchemaVersion() {
        return schemaVersion;
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

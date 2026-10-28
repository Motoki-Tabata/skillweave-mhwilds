package io.github.motokitabata.skillweave.service;

import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.common.exception.ResourceNotFoundException;
import io.github.motokitabata.skillweave.dto.request.CreateCharmRequest;
import io.github.motokitabata.skillweave.dto.request.UpdateCharmRequest;
import io.github.motokitabata.skillweave.dto.response.CharmResponse;
import io.github.motokitabata.skillweave.entity.Charm;
import io.github.motokitabata.skillweave.repository.CharmRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** アカウントの護石の一覧・作成・更新・削除。すべて呼んだユーザーの行だけを対象にする。 */
@Service
public class CharmService {

    public static final String NOT_FOUND = "Charm not found";
    static final String ID_EXISTS = "Charm id already exists";
    private static final String CHANGED = "Charm was changed by another request";

    private final CharmRepository repository;

    public CharmService(CharmRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<CharmResponse> list(UUID userId) {
        return repository.findByUserIdAndDeletedAtIsNullOrderByIdDesc(userId).stream()
                .map(CharmResponse::from)
                .toList();
    }

    /** 衝突は、存在の確認と、同時の作成による主キー違反のどちらでも 409 にする。 */
    public CharmResponse create(UUID userId, CreateCharmRequest request) {
        if (repository.existsById(request.id())) {
            throw new ResourceConflictException(ID_EXISTS);
        }
        Charm charm = new Charm(request.id(), userId, request.payload(), request.schemaVersion(), now());
        try {
            return CharmResponse.from(repository.saveAndFlush(charm));
        } catch (DataIntegrityViolationException e) {
            throw new ResourceConflictException(ID_EXISTS, e);
        }
    }

    @Transactional
    public CharmResponse update(UUID userId, UUID id, UpdateCharmRequest request) {
        Charm charm = repository
                .findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        if (!charm.getVersion().equals(request.version())) {
            throw new ResourceConflictException(CHANGED);
        }
        charm.update(request.payload(), request.schemaVersion(), now());
        try {
            return CharmResponse.from(repository.saveAndFlush(charm));
        } catch (ObjectOptimisticLockingFailureException e) {
            throw new ResourceConflictException(CHANGED, e);
        }
    }

    /** 冪等で、行バージョンに依らない。行が無い・他のユーザーの行・削除済みの行でも何もしない。 */
    @Transactional
    public void delete(UUID userId, UUID id) {
        repository.markDeleted(id, userId, now());
    }

    // PostgreSQL の timestamptz はマイクロ秒なので、応答と DB の値が食い違わないよう丸める。
    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}

package io.github.motokitabata.skillweave.service;

import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.common.exception.ResourceNotFoundException;
import io.github.motokitabata.skillweave.dto.request.CreateBuildRequest;
import io.github.motokitabata.skillweave.dto.request.RenameBuildRequest;
import io.github.motokitabata.skillweave.dto.response.BuildResponse;
import io.github.motokitabata.skillweave.entity.Build;
import io.github.motokitabata.skillweave.repository.BuildRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** アカウントの保存した構成の一覧・作成・名前の変更・削除。すべて呼んだユーザーの行だけを対象にする。 */
@Service
public class BuildService {

    public static final String NOT_FOUND = "Build not found";
    static final String ID_EXISTS = "Build id already exists";
    private static final String CHANGED = "Build was changed by another request";

    private final BuildRepository repository;

    public BuildService(BuildRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<BuildResponse> list(UUID userId) {
        return repository.findByUserIdAndDeletedAtIsNullOrderByIdDesc(userId).stream()
                .map(BuildResponse::from)
                .toList();
    }

    /** 衝突は、存在の確認と、同時の作成による主キー違反のどちらでも 409 にする。 */
    public BuildResponse create(UUID userId, CreateBuildRequest request) {
        if (repository.existsById(request.id())) {
            throw new ResourceConflictException(ID_EXISTS);
        }
        Build build = new Build(
                request.id(),
                userId,
                request.name(),
                request.masterVersion(),
                request.payload(),
                request.schemaVersion(),
                now());
        try {
            return BuildResponse.from(repository.saveAndFlush(build));
        } catch (DataIntegrityViolationException e) {
            throw new ResourceConflictException(ID_EXISTS, e);
        }
    }

    @Transactional
    public BuildResponse rename(UUID userId, UUID id, RenameBuildRequest request) {
        Build build = repository
                .findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        if (!build.getVersion().equals(request.version())) {
            throw new ResourceConflictException(CHANGED);
        }
        build.rename(request.name(), now());
        try {
            return BuildResponse.from(repository.saveAndFlush(build));
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

package io.github.motokitabata.skillweave.service;

import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.common.exception.ResourceNotFoundException;
import io.github.motokitabata.skillweave.dto.request.CreateCustomWeaponRequest;
import io.github.motokitabata.skillweave.dto.request.UpdateCustomWeaponRequest;
import io.github.motokitabata.skillweave.dto.response.CustomWeaponResponse;
import io.github.motokitabata.skillweave.entity.CustomWeapon;
import io.github.motokitabata.skillweave.repository.CustomWeaponRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** アカウントの個体差のある武器の一覧・作成・更新・削除。すべて呼んだユーザーの行だけを対象にする。 */
@Service
public class WeaponService {

    public static final String NOT_FOUND = "Weapon not found";
    static final String ID_EXISTS = "Weapon id already exists";
    private static final String CHANGED = "Weapon was changed by another request";

    private final CustomWeaponRepository repository;

    public WeaponService(CustomWeaponRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<CustomWeaponResponse> list(UUID userId) {
        return repository.findByUserIdAndDeletedAtIsNullOrderByIdDesc(userId).stream()
                .map(CustomWeaponResponse::from)
                .toList();
    }

    /** 衝突は、存在の確認と、同時の作成による主キー違反のどちらでも 409 にする。 */
    public CustomWeaponResponse create(UUID userId, CreateCustomWeaponRequest request) {
        if (repository.existsById(request.id())) {
            throw new ResourceConflictException(ID_EXISTS);
        }
        CustomWeapon weapon = new CustomWeapon(request.id(), userId, request.payload(), request.schemaVersion(), now());
        try {
            return CustomWeaponResponse.from(repository.saveAndFlush(weapon));
        } catch (DataIntegrityViolationException e) {
            throw new ResourceConflictException(ID_EXISTS, e);
        }
    }

    @Transactional
    public CustomWeaponResponse update(UUID userId, UUID id, UpdateCustomWeaponRequest request) {
        CustomWeapon weapon = repository
                .findByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException(NOT_FOUND));
        if (!weapon.getVersion().equals(request.version())) {
            throw new ResourceConflictException(CHANGED);
        }
        weapon.update(request.payload(), request.schemaVersion(), now());
        try {
            return CustomWeaponResponse.from(repository.saveAndFlush(weapon));
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

package io.github.motokitabata.skillweave.service;

import io.github.motokitabata.skillweave.common.exception.ResourceConflictException;
import io.github.motokitabata.skillweave.common.exception.ResourceNotFoundException;
import io.github.motokitabata.skillweave.common.util.ConstraintViolations;
import io.github.motokitabata.skillweave.dto.request.CreateShareRequest;
import io.github.motokitabata.skillweave.dto.response.ShareResponse;
import io.github.motokitabata.skillweave.dto.response.SharedBuildResponse;
import io.github.motokitabata.skillweave.entity.Build;
import io.github.motokitabata.skillweave.entity.Share;
import io.github.motokitabata.skillweave.repository.BuildRepository;
import io.github.motokitabata.skillweave.repository.ShareRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 共有の一覧・作成・取り消しと、短縮 ID による閲覧。管理の操作は呼んだユーザーの行だけを対象にする。 */
@Service
public class ShareService {

    public static final String BUILD_NOT_FOUND = "Build not found";
    public static final String SHARE_NOT_FOUND = "Shared build not found";
    static final String ID_EXISTS = "Share id already exists";
    static final int MAX_SHORT_ID_ATTEMPTS = 5;
    private static final String PK_ID = "pk_shares_id";
    private static final String UQ_SHORT_ID = "uq_shares_short_id";
    private static final String UQ_BUILD_ID = "uq_shares_build_id";

    /** 作成の結果。{@code created} が false なら、既存の有効な共有を返したもの。 */
    public record CreateResult(ShareResponse share, boolean created) {}

    private final ShareRepository shares;
    private final BuildRepository builds;
    private final ShortIdGenerator shortIds;

    public ShareService(ShareRepository shares, BuildRepository builds, ShortIdGenerator shortIds) {
        this.shares = shares;
        this.builds = builds;
        this.shortIds = shortIds;
    }

    @Transactional(readOnly = true)
    public List<ShareResponse> list(UUID userId) {
        return shares.findByUserIdAndDeletedAtIsNullOrderByIdDesc(userId).stream()
                .map(ShareResponse::from)
                .toList();
    }

    /**
     * 元の構成 → 既存の有効な共有 → ID の衝突 → 写して INSERT の順に判定する。一意制約の違反は制約名で分け、
     * 短縮 ID の衝突は採番し直し、同時の作成（構成ごとの有効な共有）は既存の共有を返す。
     */
    public CreateResult create(UUID userId, CreateShareRequest request) {
        Build build = builds.findByIdAndUserIdAndDeletedAtIsNull(request.buildId(), userId)
                .orElseThrow(() -> new ResourceNotFoundException(BUILD_NOT_FOUND));
        Optional<Share> active = shares.findByBuildIdAndDeletedAtIsNull(build.getId());
        if (active.isPresent()) {
            return new CreateResult(ShareResponse.from(active.get()), false);
        }
        if (shares.existsById(request.id())) {
            throw new ResourceConflictException(ID_EXISTS);
        }
        for (int attempt = 1; attempt < MAX_SHORT_ID_ATTEMPTS; attempt++) {
            Optional<CreateResult> created = insert(request.id(), build, true);
            if (created.isPresent()) {
                return created.get();
            }
        }
        // 最後の試行は、短縮 ID が衝突しても変換せずに例外を上げる。
        return insert(request.id(), build, false).orElseThrow();
    }

    /** 短縮 ID の衝突で採番し直せるとき（{@code retryable}）だけ空を返す。 */
    private Optional<CreateResult> insert(UUID id, Build build, boolean retryable) {
        Share share = new Share(id, shortIds.generate(), build, now());
        try {
            return Optional.of(new CreateResult(ShareResponse.from(shares.saveAndFlush(share)), true));
        } catch (DataIntegrityViolationException e) {
            String violated = ConstraintViolations.constraintName(e).orElse("");
            if (PK_ID.equals(violated)) {
                throw new ResourceConflictException(ID_EXISTS, e);
            }
            if (UQ_BUILD_ID.equals(violated)) {
                return Optional.of(new CreateResult(ShareResponse.from(existing(build.getId(), e)), false));
            }
            if (UQ_SHORT_ID.equals(violated) && retryable) {
                return Optional.empty();
            }
            throw e;
        }
    }

    private Share existing(UUID buildId, DataIntegrityViolationException cause) {
        return shares.findByBuildIdAndDeletedAtIsNull(buildId).orElseThrow(() -> cause);
    }

    /** 冪等。行が無い・他のユーザーの行・取り消し済みの行でも何もしない。 */
    @Transactional
    public void revoke(UUID userId, UUID id) {
        shares.markRevoked(id, userId, now());
    }

    @Transactional(readOnly = true)
    public SharedBuildResponse view(String shortId) {
        return shares.findByShortIdAndDeletedAtIsNull(shortId)
                .map(SharedBuildResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException(SHARE_NOT_FOUND));
    }

    // PostgreSQL の timestamptz はマイクロ秒なので、応答と DB の値が食い違わないよう丸める。
    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}

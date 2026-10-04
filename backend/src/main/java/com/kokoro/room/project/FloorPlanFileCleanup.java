package com.kokoro.room.project;

import com.kokoro.room.floorplan.FloorPlanStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Deletes floor-plan files recorded by {@link ProjectService#delete}. A failed file stays recorded and is
 * retried on the next run, including after a restart. Storage deletion is idempotent, so a run that overlaps
 * another one (or another instance) only repeats harmless deletes.
 */
@Component
@EnableScheduling
@DependsOn("flyway")
public class FloorPlanFileCleanup {
    private static final Logger log = LoggerFactory.getLogger(FloorPlanFileCleanup.class);
    private static final int BATCH = 100;

    private final JdbcTemplate jdbc;
    private final FloorPlanStorage storage;

    public FloorPlanFileCleanup(JdbcTemplate jdbc, FloorPlanStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    /** Must run in the transaction that deletes the project. */
    public void enqueue(String projectId, Collection<String> objectKeys) {
        for (String objectKey : objectKeys) {
            jdbc.update("""
                    INSERT INTO floor_plan_file_cleanup (object_key, project_id, created_at)
                    VALUES (?, ?, ?) ON CONFLICT (object_key) DO NOTHING
                    """, objectKey, projectId, Timestamp.from(Instant.now()));
        }
    }

    @Scheduled(fixedDelayString = "${app.floor-plan-cleanup-retry-interval:PT1M}")
    public void drain() {
        List<String> keys;
        do {
            keys = jdbc.queryForList("""
                    SELECT object_key FROM floor_plan_file_cleanup
                     ORDER BY COALESCE(last_attempt_at, created_at) LIMIT ?
                    """, String.class, BATCH);
            boolean progressed = false;
            for (String key : keys) progressed |= tryDelete(key);
            if (!progressed) return; // ponytail: only failing rows left; next scheduled run retries them.
        } while (keys.size() == BATCH);
    }

    private boolean tryDelete(String objectKey) {
        try {
            storage.delete(objectKey);
            jdbc.update("DELETE FROM floor_plan_file_cleanup WHERE object_key = ?", objectKey);
            return true;
        } catch (Exception failure) {
            // Keep the storage path out of the stored message; the exception type is enough to triage.
            log.warn("도면 파일 정리에 실패했습니다. 다시 시도합니다. ({})", failure.getClass().getSimpleName());
            jdbc.update("""
                    UPDATE floor_plan_file_cleanup
                       SET attempts = attempts + 1, last_attempt_at = ?, last_error = ?
                     WHERE object_key = ?
                    """, Timestamp.from(Instant.now()), failure.getClass().getSimpleName(), objectKey);
            return false;
        }
    }
}

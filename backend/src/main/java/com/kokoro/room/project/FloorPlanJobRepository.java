package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
@DependsOn("flyway")
public class FloorPlanJobRepository {
    private final JdbcTemplate jdbc;

    public FloorPlanJobRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(FloorPlanJob job) {
        jdbc.update("""
                INSERT INTO floor_plan_jobs (
                    job_id, project_id, object_key, status, progress,
                    error_code, error_message, retryable, created_at, started_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, job.jobId(), job.projectId(), job.objectKey(), job.status().name(), job.progress(),
                job.errorCode(), job.errorMessage(), job.retryable(), timestamp(job.createdAt()),
                timestamp(job.startedAt()), timestamp(job.completedAt()));
    }

    public Optional<FloorPlanJob> findById(String projectId, String jobId) {
        List<FloorPlanJob> jobs = jdbc.query("""
                SELECT job_id, project_id, object_key, status, progress,
                       error_code, error_message, retryable, created_at, started_at, completed_at
                  FROM floor_plan_jobs WHERE project_id = ? AND job_id = ?
                """, (rs, rowNum) -> new FloorPlanJob(
                rs.getString("job_id"), rs.getString("project_id"), rs.getString("object_key"),
                ConversionStatus.valueOf(rs.getString("status")), rs.getInt("progress"),
                rs.getString("error_code"), rs.getString("error_message"), rs.getBoolean("retryable"),
                instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("started_at")),
                instant(rs.getTimestamp("completed_at"))), projectId, jobId);
        return jobs.stream().findFirst();
    }

    public boolean update(FloorPlanJob job) {
        return jdbc.update("""
                UPDATE floor_plan_jobs
                   SET status = ?, progress = ?, error_code = ?, error_message = ?, retryable = ?,
                       started_at = ?, completed_at = ?
                 WHERE job_id = ? AND project_id = ?
                """, job.status().name(), job.progress(), job.errorCode(), job.errorMessage(), job.retryable(),
                timestamp(job.startedAt()), timestamp(job.completedAt()), job.jobId(), job.projectId()) == 1;
    }

    public void deleteByProject(String projectId) {
        jdbc.update("DELETE FROM floor_plan_jobs WHERE project_id = ?", projectId);
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }
}

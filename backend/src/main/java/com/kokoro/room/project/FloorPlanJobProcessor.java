package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

@Component
public class FloorPlanJobProcessor {
    private final ProjectRepository projectRepository;
    private final FloorPlanJobRepository jobRepository;

    public FloorPlanJobProcessor(ProjectRepository projectRepository, FloorPlanJobRepository jobRepository) {
        this.projectRepository = projectRepository;
        this.jobRepository = jobRepository;
    }

    public void process(String projectId, String jobId) {
        try {
            FloorPlanJob current = findJob(projectId, jobId);
            Instant startedAt = Instant.now();
            FloorPlanJob processing = new FloorPlanJob(jobId, projectId, current.objectKey(), ConversionStatus.PROCESSING,
                    25, null, null, true, current.createdAt(), startedAt, null);
            jobRepository.update(processing);
            updateProject(projectId, jobId, ConversionStatus.PROCESSING, 25, null, null, true);
            Thread.sleep(50);
            Instant completedAt = Instant.now();
            FloorPlanJob completed = new FloorPlanJob(jobId, projectId, current.objectKey(), ConversionStatus.READY,
                    100, null, null, false, current.createdAt(), startedAt, completedAt);
            jobRepository.update(completed);
            updateProject(projectId, jobId, ConversionStatus.READY, 100, null, null, false);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            markFailed(projectId, jobId, "CONVERSION_INTERRUPTED", "도면 변환이 중단되었습니다.", true);
        } catch (Exception exception) {
            markFailed(projectId, jobId, "CONVERSION_FAILED", "도면 변환에 실패했습니다.", true);
        }
    }

    private void markFailed(String projectId, String jobId, String code, String message, boolean retryable) {
        try {
            FloorPlanJob current = findJob(projectId, jobId);
            FloorPlanJob failed = new FloorPlanJob(jobId, projectId, current.objectKey(), ConversionStatus.FAILED,
                    current.progress(), code, message, retryable, current.createdAt(), current.startedAt(), Instant.now());
            jobRepository.update(failed);
            updateProject(projectId, jobId, ConversionStatus.FAILED, current.progress(), code, message, retryable);
        } catch (Exception ignored) {
            // The original failure is already represented by the async task; avoid replacing it.
        }
    }

    private FloorPlanJob findJob(String projectId, String jobId) {
        return jobRepository.findById(projectId, jobId)
                .orElseThrow(() -> new IllegalStateException("Floor plan job does not exist: " + jobId));
    }

    private void updateProject(String projectId, String jobId, ConversionStatus status, int progress,
                               String errorCode, String errorMessage, boolean retryable) {
        Optional<RenovationProject> project = projectRepository.findById(projectId);
        if (project.isEmpty()) return;
        FloorPlan previous = project.get().floorPlan();
        FloorPlan next = new FloorPlan(previous.fileName(), previous.size(), status, progress, previous.uploadedAt(),
                jobId, previous.objectKey(), errorCode, errorMessage, retryable);
        RenovationProject updated = new RenovationProject(project.get().id(), project.get().ownerId(), project.get().name(),
                project.get().roomType(), project.get().dimensions(), project.get().room(), next,
                project.get().furniture(), Instant.now());
        projectRepository.replace(updated);
    }
}

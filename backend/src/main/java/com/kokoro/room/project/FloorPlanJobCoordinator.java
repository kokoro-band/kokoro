package com.kokoro.room.project;

import com.kokoro.room.floorplan.FloorPlanStorage.StoredFloorPlan;
import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.FloorPlan;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import com.kokoro.room.project.ProjectModels.RenovationProject;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;

import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Component
public class FloorPlanJobCoordinator {
    private final ProjectRepository projectRepository;
    private final FloorPlanJobRepository jobRepository;

    public FloorPlanJobCoordinator(ProjectRepository projectRepository, FloorPlanJobRepository jobRepository) {
        this.projectRepository = projectRepository;
        this.jobRepository = jobRepository;
    }

    @Transactional
    public RenovationProject start(String projectId, String ownerId, String jobId,
                                   StoredFloorPlan stored, Instant createdAt) {
        FloorPlan floorPlan = new FloorPlan(stored.fileName(), stored.size(), ConversionStatus.PROCESSING, 0,
                createdAt, jobId, stored.objectKey(), null, null, true);
        if (!projectRepository.tryStartFloorPlan(projectId, ownerId, floorPlan, createdAt)) {
            if (projectRepository.findById(projectId).filter(project -> project.ownerId().equals(ownerId)).isEmpty()) {
                throw new ResponseStatusException(NOT_FOUND, "프로젝트를 찾을 수 없습니다.");
            }
            throw new ResponseStatusException(CONFLICT, "현재 도면 변환 작업이 진행 중입니다.");
        }
        jobRepository.insert(new FloorPlanJob(jobId, projectId, stored.objectKey(), ConversionStatus.PROCESSING,
                0, null, null, true, createdAt, null, null));
        return projectRepository.findById(projectId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "프로젝트를 찾을 수 없습니다."));
    }

    @Transactional
    public boolean markProcessing(String projectId, String jobId, int progress) {
        return transition(projectId, jobId, ConversionStatus.PROCESSING, progress,
                null, null, true, true, false);
    }

    @Transactional
    public boolean markReady(String projectId, String jobId) {
        return transition(projectId, jobId, ConversionStatus.READY, 100,
                null, null, false, false, true);
    }

    @Transactional
    public boolean fail(String projectId, String jobId, String errorCode, String errorMessage) {
        return transition(projectId, jobId, ConversionStatus.FAILED, null,
                errorCode, errorMessage, true, false, true);
    }

    private boolean transition(String projectId, String jobId, ConversionStatus status, Integer progress,
                               String errorCode, String errorMessage, boolean retryable,
                               boolean start, boolean complete) {
        FloorPlanJob current = jobRepository.findById(projectId, jobId).orElse(null);
        if (current == null) return false;
        int nextProgress = progress == null ? current.progress() : progress;
        Instant now = Instant.now();
        FloorPlanJob updated = new FloorPlanJob(jobId, projectId, current.objectKey(), status, nextProgress,
                errorCode, errorMessage, retryable, current.createdAt(),
                start && current.startedAt() == null ? now : current.startedAt(), complete ? now : null);
        if (!jobRepository.update(updated)) return false;
        projectRepository.updateFloorPlanStatus(projectId, jobId, status, nextProgress,
                errorCode, errorMessage, retryable);
        return true;
    }
}

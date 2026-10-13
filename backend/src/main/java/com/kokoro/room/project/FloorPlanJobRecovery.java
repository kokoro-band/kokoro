package com.kokoro.room.project;

import com.kokoro.room.project.ProjectModels.ConversionStatus;
import com.kokoro.room.project.ProjectModels.FloorPlanJob;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Component
public class FloorPlanJobRecovery implements ApplicationRunner {
    static final String ERROR_CODE = "PROCESSING_INTERRUPTED";
    static final String ERROR_MESSAGE = "서버가 재시작되어 도면 변환이 중단되었습니다. 다시 업로드해 주세요.";

    private final ProjectRepository projectRepository;
    private final FloorPlanJobRepository jobRepository;

    public FloorPlanJobRecovery(ProjectRepository projectRepository, FloorPlanJobRepository jobRepository) {
        this.projectRepository = projectRepository;
        this.jobRepository = jobRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        recover();
    }

    @Transactional
    public void recover() {
        // Do not run independent bulk scans: a new upload between them is not part of this recovery.
        for (var project : projectRepository.lockProcessing()) {
            var floorPlan = project.floorPlan();
            String jobId = floorPlan.jobId();
            jobRepository.findById(project.id(), jobId)
                    .filter(job -> job.status() == ConversionStatus.PROCESSING)
                    .ifPresent(job -> jobRepository.update(new FloorPlanJob(
                    job.jobId(), job.projectId(), job.objectKey(), ConversionStatus.FAILED, job.progress(),
                    ERROR_CODE, ERROR_MESSAGE, true, job.createdAt(), job.startedAt(), Instant.now())));
            projectRepository.updateFloorPlanStatus(project.id(), jobId, ConversionStatus.FAILED,
                    floorPlan.progress(), ERROR_CODE, ERROR_MESSAGE, true);
        }
    }
}

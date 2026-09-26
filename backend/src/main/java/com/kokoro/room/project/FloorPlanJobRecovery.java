package com.kokoro.room.project;

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
        projectRepository.failProcessingFloorPlans(ERROR_CODE, ERROR_MESSAGE);
        jobRepository.failProcessing(Instant.now(), ERROR_CODE, ERROR_MESSAGE);
    }
}

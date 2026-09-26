package com.kokoro.room.project;

import org.springframework.stereotype.Component;

@Component
public class FloorPlanJobProcessor {
    private final FloorPlanJobCoordinator coordinator;

    public FloorPlanJobProcessor(FloorPlanJobCoordinator coordinator) {
        this.coordinator = coordinator;
    }

    public void process(String projectId, String jobId) {
        try {
            if (!coordinator.markProcessing(projectId, jobId, 25)) return;
            Thread.sleep(50);
            coordinator.markReady(projectId, jobId);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            coordinator.fail(projectId, jobId, "CONVERSION_INTERRUPTED", "도면 변환이 중단되었습니다.");
        } catch (Exception exception) {
            coordinator.fail(projectId, jobId, "CONVERSION_FAILED", "도면 변환에 실패했습니다.");
        }
    }
}
